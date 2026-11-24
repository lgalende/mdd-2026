import { expect } from "chai";
import { network } from "hardhat";
import { IMPLEMENTATION_SLOT, readAddressSlot, readUintSlot } from "../../scripts/slots.js";

const { ethers, networkHelpers } = await network.create();

describe("06 - UUPS (VaultUUPSProxy + UUPSUpgradeable)", function () {
  async function deployFixture() {
    const [owner, alice, attacker] = await ethers.getSigners();
    const implementation = await ethers.deployContract("VaultUUPSV1B");
    const initData = implementation.interface.encodeFunctionData("initialize", [owner.address]);
    const proxy = await ethers.deployContract("VaultUUPSProxy", [await implementation.getAddress(), initData]);
    const vault = await ethers.getContractAt("VaultUUPSV1B", await proxy.getAddress());
    await vault.connect(alice).deposit({ value: 1000n });
    return { owner, alice, attacker, implementation, proxy, vault };
  }

  it("owner upgrades with upgradeToAndCall and state is preserved", async function () {
    const { owner, vault } = await networkHelpers.loadFixture(deployFixture);
    const v2 = await ethers.deployContract("VaultUUPSV2");

    // The upgrade function lives in the implementation, so we call it through the proxy.
    await vault
      .connect(owner)
      .upgradeToAndCall(await v2.getAddress(), v2.interface.encodeFunctionData("initializeV2", [50n]));

    const vaultV2 = await ethers.getContractAt("VaultUUPSV2", await vault.getAddress());
    expect(await vaultV2.version()).to.equal(2n);
    expect(await vaultV2.owner()).to.equal(owner.address);
    expect(await vaultV2.totalDeposits()).to.equal(1000n);
    expect(await vaultV2.fee()).to.equal(50n);
    expect(await readAddressSlot(ethers.provider, await vault.getAddress(), IMPLEMENTATION_SLOT)).to.equal(
      await v2.getAddress(),
    );
  });

  it("a non-owner can't upgrade (OwnableUnauthorizedAccount)", async function () {
    const { attacker, vault } = await networkHelpers.loadFixture(deployFixture);
    const v2 = await ethers.deployContract("VaultUUPSV2");

    await expect(vault.connect(attacker).upgradeToAndCall(await v2.getAddress(), "0x"))
      .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount")
      .withArgs(attacker.address);
  });

  describe("VaultUUPSV1A (non-upgradeable OZ Ownable)", function () {
    async function deployFixture() {
      const [owner, alice] = await ethers.getSigners();
      const implementation = await ethers.deployContract("VaultUUPSV1A", [owner.address]);
      // initialize() is empty: the owner was "set" in the constructor.
      const initData = implementation.interface.encodeFunctionData("initialize");
      const proxy = await ethers.deployContract("VaultUUPSProxy", [await implementation.getAddress(), initData]);
      const vault = await ethers.getContractAt("VaultUUPSV1A", await proxy.getAddress());
      return { owner, alice, implementation, proxy, vault };
    }

    it("the owner only exists in the implementation, through the proxy it's address(0)", async function () {
      const { owner, implementation, vault } = await networkHelpers.loadFixture(deployFixture);

      expect(await implementation.owner()).to.equal(owner.address);
      // This is BUG 6: Ownable's constructor never ran in the proxy's context.
      expect(await vault.owner()).to.equal(ethers.ZeroAddress);
    });

    it("nobody can upgrade anymore, not even the intended owner", async function () {
      const { owner, vault } = await networkHelpers.loadFixture(deployFixture);
      const v2 = await ethers.deployContract("VaultUUPSV2");

      // This is BUG 6: `onlyOwner` compares against address(0), so the proxy is frozen forever.
      await expect(vault.connect(owner).upgradeToAndCall(await v2.getAddress(), "0x"))
        .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount")
        .withArgs(owner.address);
    });

    it("Ownable stores `_owner` in slot 0, shifting totalDeposits to slot 1", async function () {
      const { alice, implementation, vault } = await networkHelpers.loadFixture(deployFixture);
      await vault.connect(alice).deposit({ value: 1000n });

      // In VaultUUPSV1B (OwnableUpgradeable, namespaced storage) totalDeposits is slot 0.
      expect(await readAddressSlot(ethers.provider, await implementation.getAddress(), 0n)).to.equal(
        await implementation.owner(),
      );
      expect(await readUintSlot(ethers.provider, await vault.getAddress(), 1n)).to.equal(1000n);
    });
  });

  describe("gas: deposit() through each proxy", function () {
    // Run with `--gas-stats` to see the full table per contract/function.
    it("compares deposit() gas in UUPS vs Transparent", async function () {
      const [owner, alice] = await ethers.getSigners();

      const uupsImpl = await ethers.deployContract("VaultUUPSV1B");
      const uupsProxy = await ethers.deployContract("VaultUUPSProxy", [
        await uupsImpl.getAddress(),
        uupsImpl.interface.encodeFunctionData("initialize", [owner.address]),
      ]);
      const uups = await ethers.getContractAt("VaultUUPSV1B", await uupsProxy.getAddress());

      const transparentImpl = await ethers.deployContract("VaultTransparentV1");
      const transparentProxy = await ethers.deployContract("VaultTransparentProxy", [
        await transparentImpl.getAddress(),
        owner.address,
        transparentImpl.interface.encodeFunctionData("initialize", [owner.address]),
      ]);
      const transparent = await ethers.getContractAt("VaultTransparentV1", await transparentProxy.getAddress());

      // First deposit writes totalDeposits 0 -> non-zero (expensive); measure the second one.
      await uups.connect(alice).deposit({ value: 1n });
      await transparent.connect(alice).deposit({ value: 1n });
      const uupsGas = (await (await uups.connect(alice).deposit({ value: 1n })).wait())!.gasUsed;
      const transparentGas = (await (await transparent.connect(alice).deposit({ value: 1n })).wait())!.gasUsed;

      console.log(`      deposit() gas  UUPS: ${uupsGas}  Transparent: ${transparentGas}  diff: ${transparentGas - uupsGas}`);

      // Transparent pays an extra "is msg.sender the admin?" check on every call. It's small
      // because OZ v5 keeps the admin in an immutable (v4 read it from storage: an extra SLOAD).
      expect(transparentGas).to.be.greaterThan(uupsGas);
    });
  });
});
