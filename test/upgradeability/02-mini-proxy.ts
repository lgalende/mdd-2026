import { expect } from "chai";
import { network } from "hardhat";
import { readAddressSlot } from "../../scripts/slots.js";

const { ethers, networkHelpers } = await network.create();

describe("02 - MiniProxy (hand-made proxy)", function () {
  async function deployFixture() {
    const [admin, alice] = await ethers.getSigners();
    const implementation = await ethers.deployContract("VaultV1");
    const proxy = await ethers.deployContract("MiniProxy", [await implementation.getAddress()]);
    // Same address, VaultV1's ABI: ethers doesn't know (or care) it's a proxy.
    const vault = await ethers.getContractAt("VaultV1", await proxy.getAddress());
    return { admin, alice, implementation, proxy, vault };
  }

  it("works as a VaultV1: deposit and read totalDeposits through the proxy", async function () {
    const { alice, vault } = await networkHelpers.loadFixture(deployFixture);

    await vault.connect(alice).deposit({ value: ethers.parseEther("1") });

    expect(await vault.totalDeposits()).to.equal(ethers.parseEther("1"));
    expect(await vault.version()).to.equal(1n);
  });

  it("state and ETH live in the proxy, the implementation is untouched", async function () {
    const { alice, implementation, proxy, vault } = await networkHelpers.loadFixture(deployFixture);

    await vault.connect(alice).deposit({ value: ethers.parseEther("1") });

    expect(await ethers.provider.getBalance(await proxy.getAddress())).to.equal(ethers.parseEther("1"));
    expect(await ethers.provider.getBalance(await implementation.getAddress())).to.equal(0n);
    expect(await implementation.totalDeposits()).to.equal(0n);
  });

  it("the implementation address is stored in slot 0", async function () {
    const { implementation, proxy } = await networkHelpers.loadFixture(deployFixture);

    expect(await readAddressSlot(ethers.provider, await proxy.getAddress(), 0n)).to.equal(
      await implementation.getAddress(),
    );
  });

  it("only the admin can upgrade", async function () {
    const { alice, proxy } = await networkHelpers.loadFixture(deployFixture);

    await expect(proxy.connect(alice).upgradeTo(alice.address)).to.be.revertedWithCustomError(proxy, "NotAdmin");
  });
});
