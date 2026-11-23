import { expect } from "chai";
import { network } from "hardhat";
import { ADMIN_SLOT, IMPLEMENTATION_SLOT, readAddressSlot, readUintSlot } from "../../scripts/slots.js";

const { ethers, networkHelpers } = await network.create();

describe("05 - OpenZeppelin proxies", function () {
  describe("UUPS (ERC1967Proxy + UUPSUpgradeable)", function () {
    async function deployFixture() {
      const [owner, alice, attacker] = await ethers.getSigners();
      const implementation = await ethers.deployContract("VaultUUPS");
      const initData = implementation.interface.encodeFunctionData("initialize", [owner.address]);
      const proxy = await ethers.deployContract("ERC1967Proxy", [await implementation.getAddress(), initData]);
      const vault = await ethers.getContractAt("VaultUUPS", await proxy.getAddress());
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

    it("VaultUUPSInsecure: without onlyOwner in _authorizeUpgrade anyone can upgrade", async function () {
      const [owner, , attacker] = await ethers.getSigners();
      const implementation = await ethers.deployContract("VaultUUPSInsecure");
      const initData = implementation.interface.encodeFunctionData("initialize", [owner.address]);
      const proxy = await ethers.deployContract("ERC1967Proxy", [await implementation.getAddress(), initData]);
      const vault = await ethers.getContractAt("VaultUUPSInsecure", await proxy.getAddress());

      // Stands in for any contract the attacker wants (e.g. one with a `drain()`).
      const attackerImpl = await ethers.deployContract("VaultUUPSV2", [], attacker);
      await vault.connect(attacker).upgradeToAndCall(await attackerImpl.getAddress(), "0x");

      // This is BUG 6: the attacker chose the code that now runs behind the proxy.
      expect(await readAddressSlot(ethers.provider, await proxy.getAddress(), IMPLEMENTATION_SLOT)).to.equal(
        await attackerImpl.getAddress(),
      );
      expect(await vault.version()).to.equal(2n);
    });

    describe("VaultUUPSNonUpgradeableOwnable (non-upgradeable OZ Ownable)", function () {
      async function deployFixture() {
        const [owner, alice] = await ethers.getSigners();
        const implementation = await ethers.deployContract("VaultUUPSNonUpgradeableOwnable", [owner.address]);
        // initialize() is empty: the owner was "set" in the constructor.
        const initData = implementation.interface.encodeFunctionData("initialize");
        const proxy = await ethers.deployContract("ERC1967Proxy", [await implementation.getAddress(), initData]);
        const vault = await ethers.getContractAt("VaultUUPSNonUpgradeableOwnable", await proxy.getAddress());
        return { owner, alice, implementation, proxy, vault };
      }

      it("the owner only exists in the implementation, through the proxy it's address(0)", async function () {
        const { owner, implementation, vault } = await networkHelpers.loadFixture(deployFixture);

        expect(await implementation.owner()).to.equal(owner.address);
        // This is BUG 7: Ownable's constructor never ran in the proxy's context.
        expect(await vault.owner()).to.equal(ethers.ZeroAddress);
      });

      it("nobody can upgrade anymore, not even the intended owner", async function () {
        const { owner, vault } = await networkHelpers.loadFixture(deployFixture);
        const v2 = await ethers.deployContract("VaultUUPSV2");

        // This is BUG 7: `onlyOwner` compares against address(0), so the proxy is frozen forever.
        await expect(vault.connect(owner).upgradeToAndCall(await v2.getAddress(), "0x"))
          .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount")
          .withArgs(owner.address);
      });

      it("Ownable stores `_owner` in slot 0, shifting totalDeposits to slot 1", async function () {
        const { alice, implementation, vault } = await networkHelpers.loadFixture(deployFixture);
        await vault.connect(alice).deposit({ value: 1000n });

        // In VaultUUPS (OwnableUpgradeable, namespaced storage) totalDeposits is slot 0.
        expect(await readAddressSlot(ethers.provider, await implementation.getAddress(), 0n)).to.equal(
          await implementation.owner(),
        );
        expect(await readUintSlot(ethers.provider, await vault.getAddress(), 1n)).to.equal(1000n);
      });
    });
  });

  describe("Transparent (TransparentUpgradeableProxy + ProxyAdmin)", function () {
    async function deployFixture() {
      const [owner, alice] = await ethers.getSigners();
      const implementation = await ethers.deployContract("VaultTransparent");
      const initData = implementation.interface.encodeFunctionData("initialize", [owner.address]);
      // The proxy deploys its own ProxyAdmin, owned by `owner`.
      const proxy = await ethers.deployContract("TransparentUpgradeableProxy", [
        await implementation.getAddress(),
        owner.address,
        initData,
      ]);
      const proxyAddress = await proxy.getAddress();
      const vault = await ethers.getContractAt("VaultTransparent", proxyAddress);
      await vault.connect(alice).deposit({ value: 1000n });

      // The ProxyAdmin address is only reachable through the EIP-1967 admin slot.
      const proxyAdminAddress = await readAddressSlot(ethers.provider, proxyAddress, ADMIN_SLOT);
      const proxyAdmin = await ethers.getContractAt("ProxyAdmin", proxyAdminAddress);
      return { owner, alice, proxy, vault, proxyAdmin };
    }

    it("the ProxyAdmin (read from the admin slot) is owned by owner", async function () {
      const { owner, proxyAdmin } = await networkHelpers.loadFixture(deployFixture);

      expect(await proxyAdmin.owner()).to.equal(owner.address);
    });

    it("owner upgrades via ProxyAdmin.upgradeAndCall and state is preserved", async function () {
      const { owner, proxy, proxyAdmin } = await networkHelpers.loadFixture(deployFixture);
      const v2 = await ethers.deployContract("VaultTransparentV2");

      await proxyAdmin
        .connect(owner)
        .upgradeAndCall(
          await proxy.getAddress(),
          await v2.getAddress(),
          v2.interface.encodeFunctionData("initializeV2", [50n]),
        );

      const vaultV2 = await ethers.getContractAt("VaultTransparentV2", await proxy.getAddress());
      expect(await vaultV2.version()).to.equal(2n);
      expect(await vaultV2.owner()).to.equal(owner.address);
      expect(await vaultV2.totalDeposits()).to.equal(1000n);
      expect(await vaultV2.fee()).to.equal(50n);
    });

    it("owner calling upgradeToAndCall directly on the proxy reverts", async function () {
      const { owner, proxy } = await networkHelpers.loadFixture(deployFixture);
      const v2 = await ethers.deployContract("VaultTransparentV2");
      const asProxy = await ethers.getContractAt("ITransparentUpgradeableProxy", await proxy.getAddress());

      // owner is not the proxy admin (the ProxyAdmin contract is), so the call is forwarded
      // to the implementation, which has no upgradeToAndCall and no fallback.
      await expect(asProxy.connect(owner).upgradeToAndCall(await v2.getAddress(), "0x")).to.revert(ethers);
    });

    it("the ProxyAdmin calling an app function reverts with ProxyDeniedAdminAccess", async function () {
      const { proxy, vault, proxyAdmin } = await networkHelpers.loadFixture(deployFixture);
      const proxyAdminAddress = await proxyAdmin.getAddress();
      await networkHelpers.setBalance(proxyAdminAddress, ethers.parseEther("1"));
      const adminSigner = await ethers.getImpersonatedSigner(proxyAdminAddress);

      // The admin can ONLY upgrade: this is what avoids selector clashes between proxy and app.
      await expect(vault.connect(adminSigner).deposit({ value: 1n })).to.be.revertedWithCustomError(
        proxy,
        "ProxyDeniedAdminAccess",
      );
    });
  });

  describe("gas: deposit() through each proxy", function () {
    // Run with `--gas-stats` to see the full table per contract/function.
    it("compares deposit() gas in UUPS vs Transparent", async function () {
      const [owner, alice] = await ethers.getSigners();

      const uupsImpl = await ethers.deployContract("VaultUUPS");
      const uupsProxy = await ethers.deployContract("ERC1967Proxy", [
        await uupsImpl.getAddress(),
        uupsImpl.interface.encodeFunctionData("initialize", [owner.address]),
      ]);
      const uups = await ethers.getContractAt("VaultUUPS", await uupsProxy.getAddress());

      const transparentImpl = await ethers.deployContract("VaultTransparent");
      const transparentProxy = await ethers.deployContract("TransparentUpgradeableProxy", [
        await transparentImpl.getAddress(),
        owner.address,
        transparentImpl.interface.encodeFunctionData("initialize", [owner.address]),
      ]);
      const transparent = await ethers.getContractAt("VaultTransparent", await transparentProxy.getAddress());

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
