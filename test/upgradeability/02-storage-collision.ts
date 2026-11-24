import { expect } from "chai";
import { network } from "hardhat";
import { readAddressSlot } from "../../scripts/slots.js";
import type { VaultV1 } from "../../types/ethers-contracts/contracts/upgradeability/02-storage-collision/VaultV1.js";

const { ethers, networkHelpers } = await network.create();

// Another contract is also named VaultV1 (block 3), so this one is referenced by fully qualified name.
const VAULT_V1 = "contracts/upgradeability/02-storage-collision/VaultV1.sol:VaultV1";

describe("02 - MiniProxy (hand-made proxy)", function () {
  async function deployFixture() {
    const [admin, alice] = await ethers.getSigners();
    const implementation = (await ethers.deployContract(VAULT_V1)) as unknown as VaultV1;
    const proxy = await ethers.deployContract("MiniProxy", [await implementation.getAddress()]);
    // Same address, VaultV1's ABI: ethers doesn't know (or care) it's a proxy.
    const vault = (await ethers.getContractAt(VAULT_V1, await proxy.getAddress())) as unknown as VaultV1;
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

  it("before setOwner, owner() already reads the implementation address", async function () {
    const { implementation, vault } = await networkHelpers.loadFixture(deployFixture);

    // This is BUG 1: VaultV1.owner and MiniProxy.implementation share slot 0.
    expect(await vault.owner()).to.equal(await implementation.getAddress());
  });

  it("setOwner(alice) overwrites the implementation with alice", async function () {
    const { alice, proxy, vault } = await networkHelpers.loadFixture(deployFixture);

    await vault.setOwner(alice.address);

    // This is BUG 1: writing `owner` wrote the proxy's `implementation`.
    expect(await proxy.implementation()).to.equal(alice.address);
  });

  it("after that, the next call fails: the proxy delegatecalls into an EOA", async function () {
    const { alice, vault } = await networkHelpers.loadFixture(deployFixture);
    await vault.setOwner(alice.address);

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
