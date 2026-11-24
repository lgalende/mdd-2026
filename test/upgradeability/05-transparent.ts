import { expect } from "chai";
import { network } from "hardhat";
import { ADMIN_SLOT, readAddressSlot } from "../../scripts/slots.js";

const { ethers, networkHelpers } = await network.create();

describe("05 - Transparent (VaultTransparentProxy + ProxyAdmin)", function () {
  async function deployFixture() {
    const [owner, alice] = await ethers.getSigners();
    const implementation = await ethers.deployContract("VaultTransparentV1");
    const initData = implementation.interface.encodeFunctionData("initialize", [owner.address]);
    // The proxy deploys its own ProxyAdmin, owned by `owner`.
    const proxy = await ethers.deployContract("VaultTransparentProxy", [
      await implementation.getAddress(),
      owner.address,
      initData,
    ]);
    const proxyAddress = await proxy.getAddress();
    const vault = await ethers.getContractAt("VaultTransparentV1", proxyAddress);
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
