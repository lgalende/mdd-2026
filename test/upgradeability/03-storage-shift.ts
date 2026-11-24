import hre, { network } from "hardhat";
import { expect } from "chai";
import { upgrades } from "@openzeppelin/hardhat-upgrades";
import { IMPLEMENTATION_SLOT, readAddressSlot } from "../../scripts/slots.js";
import type { VaultV1A } from "../../types/ethers-contracts/contracts/upgradeability/03-storage-shift/VaultV1A.js";
import type { VaultV1B } from "../../types/ethers-contracts/contracts/upgradeability/03-storage-shift/VaultV1B.js";

const connection = await network.create();
const { ethers, networkHelpers } = connection;

// Block 4 also has a VaultV1A and a VaultV1B, so these are referenced by fully qualified name.
const VAULT_V1A = "contracts/upgradeability/03-storage-shift/VaultV1A.sol:VaultV1A";
const VAULT_V1B = "contracts/upgradeability/03-storage-shift/VaultV1B.sol:VaultV1B";

describe("03 - Storage shift", function () {
  describe("fix: MiniProxy1967 (EIP-1967 slots)", function () {
    async function deployFixture() {
      const [admin, alice] = await ethers.getSigners();
      const implementation = (await ethers.deployContract(VAULT_V1A)) as unknown as VaultV1A;
      const proxy = await ethers.deployContract("MiniProxy1967", [await implementation.getAddress(), "0x"]);
      const vault = (await ethers.getContractAt(VAULT_V1A, await proxy.getAddress())) as unknown as VaultV1A;
      return { admin, alice, implementation, proxy, vault };
    }

    it("IMPLEMENTATION_SLOT is keccak256('eip1967.proxy.implementation') - 1", async function () {
      const { proxy } = await networkHelpers.loadFixture(deployFixture);

      const expected = BigInt(ethers.id("eip1967.proxy.implementation")) - 1n;
      expect(BigInt(await proxy.IMPLEMENTATION_SLOT())).to.equal(expected);
      expect(BigInt(await proxy.ADMIN_SLOT())).to.equal(BigInt(ethers.id("eip1967.proxy.admin")) - 1n);
    });

    it("setOwner(alice) no longer collides: owner is alice, implementation intact", async function () {
      const { alice, implementation, proxy, vault } = await networkHelpers.loadFixture(deployFixture);
      const proxyAddress = await proxy.getAddress();

      expect(await vault.owner()).to.equal(ethers.ZeroAddress);
      await vault.setOwner(alice.address);

      expect(await vault.owner()).to.equal(alice.address);
      expect(await readAddressSlot(ethers.provider, proxyAddress, 0n)).to.equal(alice.address);
      expect(await readAddressSlot(ethers.provider, proxyAddress, IMPLEMENTATION_SLOT)).to.equal(
        await implementation.getAddress(),
      );
      expect(await vault.version()).to.equal(1n);
    });
  });

  describe("state set in the constructor", function () {
    it("VaultV1B sets the owner in its constructor: through the proxy owner() is address(0)", async function () {
      const [, alice] = await ethers.getSigners();
      const implementation = (await ethers.deployContract(VAULT_V1B, [alice.address])) as unknown as VaultV1B;
      const proxy = await ethers.deployContract("MiniProxy1967", [await implementation.getAddress(), "0x"]);
      const vault = (await ethers.getContractAt(VAULT_V1B, await proxy.getAddress())) as unknown as VaultV1B;

      expect(await implementation.owner()).to.equal(alice.address);
      // This is BUG 2: the constructor never ran in the proxy's context.
      expect(await vault.owner()).to.equal(ethers.ZeroAddress);
    });
  });

  describe("storage layout on upgrade", function () {
    const DEPOSIT = 1000n;

    async function deployFixture() {
      const [admin, alice] = await ethers.getSigners();
      const v1 = (await ethers.deployContract(VAULT_V1A)) as unknown as VaultV1A;
      const initData = v1.interface.encodeFunctionData("setOwner", [alice.address]);
      const proxy = await ethers.deployContract("MiniProxy1967", [await v1.getAddress(), initData]);
      const vault = (await ethers.getContractAt(VAULT_V1A, await proxy.getAddress())) as unknown as VaultV1A;
      await vault.connect(alice).deposit({ value: DEPOSIT });
      return { admin, alice, proxy, vault };
    }

    it("VaultV2Broken (fee inserted before totalDeposits) corrupts state", async function () {
      const { alice, proxy } = await networkHelpers.loadFixture(deployFixture);
      const v2Broken = await ethers.deployContract("VaultV2Broken");

      await proxy.upgradeTo(await v2Broken.getAddress());
      const vault = await ethers.getContractAt("VaultV2Broken", await proxy.getAddress());

      expect(await vault.version()).to.equal(2n);
      expect(await vault.owner()).to.equal(alice.address); // slot 0 didn't move
      // This is BUG 3: `fee` now reads slot 1, where V1 stored totalDeposits.
      expect(await vault.fee()).to.equal(DEPOSIT);
      // This is BUG 3: `totalDeposits` moved to slot 2, which was never written.
      expect(await vault.totalDeposits()).to.equal(0n);
      // The ETH is still there, the accounting is what broke.
      expect(await ethers.provider.getBalance(await proxy.getAddress())).to.equal(DEPOSIT);
    });
  });

  describe("@openzeppelin/hardhat-upgrades validateUpgrade", function () {
    // The plugin compares the storage layouts from the build-info, like scripts/layout.ts.
    it("flags VaultV1A -> VaultV2Broken", async function () {
      const upgradesApi = await upgrades(hre, connection);

      let error: any;
      try {
        await upgradesApi.validateUpgrade(
          await ethers.getContractFactory(VAULT_V1A),
          await ethers.getContractFactory("VaultV2Broken"),
          { kind: "transparent" },
        );
      } catch (e) {
        error = e;
      }
      expect(error?.message).to.match(/New storage layout is incompatible/);
      expect(error?.message).to.include("Inserted `fee`");
    });
  });
});
