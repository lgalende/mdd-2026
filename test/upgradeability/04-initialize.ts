import { expect } from "chai";
import { network } from "hardhat";
import { readUintSlot } from "../../scripts/slots.js";

const { ethers, networkHelpers } = await network.create();

// ERC-7201 slot where OZ's Initializable stores `_initialized` (the version) and `_initializing`.
const INITIALIZABLE_SLOT = "0xf0c57e16840df040f15088dc2f81fe391c3923bec73e23a9662efc9c229c6a00";

describe("04 - Initialize", function () {
  describe("VaultV1A (initializer)", function () {
    async function deployFixture() {
      const [admin, alice, attacker] = await ethers.getSigners();
      const implementation = await ethers.deployContract("VaultV1A");
      // Init data passed to the proxy constructor: deploy + initialize in one tx, no front-running.
      const initData = implementation.interface.encodeFunctionData("initialize", [alice.address]);
      const proxy = await ethers.deployContract("VaultInitProxy", [await implementation.getAddress(), initData]);
      const vault = await ethers.getContractAt("VaultV1A", await proxy.getAddress());
      return { admin, alice, attacker, implementation, proxy, vault };
    }

    it("initialize sets the owner in the proxy's storage", async function () {
      const { alice, vault } = await networkHelpers.loadFixture(deployFixture);

      expect(await vault.owner()).to.equal(alice.address);
      expect(await readUintSlot(ethers.provider, await vault.getAddress(), INITIALIZABLE_SLOT)).to.equal(1n);
    });

    it("a second initialize reverts with InvalidInitialization", async function () {
      const { attacker, vault } = await networkHelpers.loadFixture(deployFixture);

      await expect(vault.connect(attacker).initialize(attacker.address)).to.be.revertedWithCustomError(
        vault,
        "InvalidInitialization",
      );
    });

    it("attack: anyone can initialize the implementation directly", async function () {
      const { attacker, implementation } = await networkHelpers.loadFixture(deployFixture);

      await implementation.connect(attacker).initialize(attacker.address);

      // This is BUG 4: the attacker owns the implementation. Harmless here, but in a
      // UUPS implementation the owner can call upgradeToAndCall on it (pre-Cancun: selfdestruct it).
      expect(await implementation.owner()).to.equal(attacker.address);
    });
  });

  describe("VaultV1B (_disableInitializers in the constructor)", function () {
    async function deployFixture() {
      const [admin, alice, attacker] = await ethers.getSigners();
      const implementation = await ethers.deployContract("VaultV1B");
      const initData = implementation.interface.encodeFunctionData("initialize", [admin.address]);
      const proxy = await ethers.deployContract("VaultInitProxy", [await implementation.getAddress(), initData]);
      const vault = await ethers.getContractAt("VaultV1B", await proxy.getAddress());
      return { admin, alice, attacker, implementation, proxy, vault };
    }

    it("the implementation can no longer be initialized", async function () {
      const { attacker, implementation } = await networkHelpers.loadFixture(deployFixture);

      await expect(implementation.connect(attacker).initialize(attacker.address)).to.be.revertedWithCustomError(
        implementation,
        "InvalidInitialization",
      );
      // _disableInitializers sets the version to max uint64 in the implementation only.
      expect(await readUintSlot(ethers.provider, await implementation.getAddress(), INITIALIZABLE_SLOT)).to.equal(
        2n ** 64n - 1n,
      );
    });

    it("the proxy is still initialized normally", async function () {
      const { admin, vault } = await networkHelpers.loadFixture(deployFixture);

      expect(await vault.owner()).to.equal(admin.address);
    });

    it("VaultV2: upgradeToAndCall runs initializeV2 (reinitializer(2)) in the same tx", async function () {
      const { admin, alice, proxy, vault } = await networkHelpers.loadFixture(deployFixture);
      await vault.connect(alice).deposit({ value: 1000n });

      const v2 = await ethers.deployContract("VaultV2");
      const migration = v2.interface.encodeFunctionData("initializeV2", [50n]);
      // admin is both the proxy admin and the vault owner, so initializeV2's owner check passes.
      await proxy.connect(admin).upgradeToAndCall(await v2.getAddress(), migration);

      const vaultV2 = await ethers.getContractAt("VaultV2", await proxy.getAddress());
      expect(await vaultV2.version()).to.equal(2n);
      expect(await vaultV2.owner()).to.equal(admin.address);
      expect(await vaultV2.totalDeposits()).to.equal(1000n);
      expect(await vaultV2.fee()).to.equal(50n);
      expect(await readUintSlot(ethers.provider, await proxy.getAddress(), INITIALIZABLE_SLOT)).to.equal(2n);

      // Version 2 already used: running the migration again reverts.
      await expect(vaultV2.initializeV2(99n)).to.be.revertedWithCustomError(vaultV2, "InvalidInitialization");
    });

    it("the consumed init version lives in the proxy and survives the upgrade", async function () {
      const { proxy } = await networkHelpers.loadFixture(deployFixture);
      const v2 = await ethers.deployContract("VaultV2");
      await proxy.upgradeTo(await v2.getAddress());

      // Version 1 was consumed by V1's `initializer` and stays in the proxy's storage.
      // That's why a V2 migration can't use `initializer` again: it needs `reinitializer(2)`.
      expect(await readUintSlot(ethers.provider, await proxy.getAddress(), INITIALIZABLE_SLOT)).to.equal(1n);
    });
  });
});
