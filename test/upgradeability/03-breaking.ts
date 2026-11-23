import hre, { network } from "hardhat";
import { expect } from "chai";
import { upgrades } from "@openzeppelin/hardhat-upgrades";
import { IMPLEMENTATION_SLOT, readAddressSlot, readUintSlot } from "../../scripts/slots.js";

const connection = await network.create();
const { ethers, networkHelpers } = connection;

describe("03 - Breaking the proxy", function () {
  describe("storage collision (implementation in slot 0)", function () {
    async function deployFixture() {
      const [admin, alice] = await ethers.getSigners();
      const implementation = await ethers.deployContract("VaultV1");
      const proxy = await ethers.deployContract("MiniProxy", [await implementation.getAddress()]);
      const vault = await ethers.getContractAt("VaultV1", await proxy.getAddress());
      return { admin, alice, implementation, proxy, vault };
    }

    it("before initialize, owner() already reads the implementation address", async function () {
      const { implementation, vault } = await networkHelpers.loadFixture(deployFixture);

      // This is BUG 1: VaultV1.owner and MiniProxy.implementation share slot 0.
      expect(await vault.owner()).to.equal(await implementation.getAddress());
    });

    it("initialize(alice) overwrites the implementation with alice", async function () {
      const { alice, proxy, vault } = await networkHelpers.loadFixture(deployFixture);

      await vault.initialize(alice.address);

      // This is BUG 1: writing `owner` wrote the proxy's `implementation`.
      expect(await proxy.implementation()).to.equal(alice.address);
    });

    it("after that, the next call fails: the proxy delegatecalls into an EOA", async function () {
      const { alice, vault } = await networkHelpers.loadFixture(deployFixture);
      await vault.initialize(alice.address);

      // delegatecall to an address without code SUCCEEDS with empty return data,
      // so view functions can't be decoded...
      let error: any;
      try {
        await vault.version();
      } catch (e) {
        error = e;
      }
      expect(error?.code).to.equal("BAD_DATA");

      // ...and deposits "succeed" but no code runs: the ETH is stuck in the proxy.
      await expect(vault.deposit({ value: 1000n })).to.changeEtherBalance(ethers, vault, 1000n);
    });
  });

  describe("fix: MiniProxy1967 (EIP-1967 slots)", function () {
    async function deployFixture() {
      const [admin, alice] = await ethers.getSigners();
      const implementation = await ethers.deployContract("VaultV1");
      const proxy = await ethers.deployContract("MiniProxy1967", [await implementation.getAddress(), "0x"]);
      const vault = await ethers.getContractAt("VaultV1", await proxy.getAddress());
      return { admin, alice, implementation, proxy, vault };
    }

    it("IMPLEMENTATION_SLOT is keccak256('eip1967.proxy.implementation') - 1", async function () {
      const { proxy } = await networkHelpers.loadFixture(deployFixture);

      const expected = BigInt(ethers.id("eip1967.proxy.implementation")) - 1n;
      expect(BigInt(await proxy.IMPLEMENTATION_SLOT())).to.equal(expected);
      expect(BigInt(await proxy.ADMIN_SLOT())).to.equal(BigInt(ethers.id("eip1967.proxy.admin")) - 1n);
    });

    it("initialize(alice) no longer collides: owner is alice, implementation intact", async function () {
      const { alice, implementation, proxy, vault } = await networkHelpers.loadFixture(deployFixture);
      const proxyAddress = await proxy.getAddress();

      expect(await vault.owner()).to.equal(ethers.ZeroAddress);
      await vault.initialize(alice.address);

      expect(await vault.owner()).to.equal(alice.address);
      expect(await readAddressSlot(ethers.provider, proxyAddress, 0n)).to.equal(alice.address);
      expect(await readAddressSlot(ethers.provider, proxyAddress, IMPLEMENTATION_SLOT)).to.equal(
        await implementation.getAddress(),
      );
      expect(await vault.version()).to.equal(1n);
    });
  });

  describe("storage layout on upgrade", function () {
    const DEPOSIT = 1000n;

    async function deployFixture() {
      const [admin, alice] = await ethers.getSigners();
      const v1 = await ethers.deployContract("VaultV1");
      const initData = v1.interface.encodeFunctionData("initialize", [alice.address]);
      const proxy = await ethers.deployContract("MiniProxy1967", [await v1.getAddress(), initData]);
      const vault = await ethers.getContractAt("VaultV1", await proxy.getAddress());
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

    it("VaultV2 (fee at the end) preserves everything", async function () {
      const { alice, proxy } = await networkHelpers.loadFixture(deployFixture);
      const v2 = await ethers.deployContract("VaultV2");

      await proxy.upgradeTo(await v2.getAddress());
      const vault = await ethers.getContractAt("VaultV2", await proxy.getAddress());

      expect(await vault.version()).to.equal(2n);
      expect(await vault.owner()).to.equal(alice.address);
      expect(await vault.totalDeposits()).to.equal(DEPOSIT);
      expect(await vault.fee()).to.equal(0n);

      await vault.initializeV2(50);
      expect(await vault.fee()).to.equal(50n);
      expect(await readUintSlot(ethers.provider, await proxy.getAddress(), 2n)).to.equal(50n);
    });
  });

  describe("@openzeppelin/hardhat-upgrades validateUpgrade", function () {
    // The plugin compares the storage layouts from the build-info, like scripts/layout.ts.
    it("rejects VaultV1 -> VaultV2Broken and accepts VaultV1 -> VaultV2", async function () {
      const upgradesApi = await upgrades(hre, connection);
      const V1 = await ethers.getContractFactory("VaultV1");
      const V2Broken = await ethers.getContractFactory("VaultV2Broken");
      const V2 = await ethers.getContractFactory("VaultV2");
      const opts = { kind: "transparent" as const };

      let error: any;
      try {
        await upgradesApi.validateUpgrade(V1, V2Broken, opts);
      } catch (e) {
        error = e;
      }
      expect(error?.message).to.match(/New storage layout is incompatible/);
      expect(error?.message).to.include("Inserted `fee`");

      await upgradesApi.validateUpgrade(V1, V2, opts); // does not throw
    });
  });
});
