import { expect } from "chai";
import { network } from "hardhat";
import { BEACON_SLOT, readAddressSlot } from "../../scripts/slots.js";

const { ethers, networkHelpers } = await network.create();

describe("07 - Beacon (VaultFactory + UpgradeableBeacon)", function () {
  const DEPOSITS = [ethers.parseEther("1"), ethers.parseEther("2"), ethers.parseEther("3")];

  async function deployFixture() {
    const [deployer, alice, bob, carol] = await ethers.getSigners();
    const users = [alice, bob, carol];
    const v1 = await ethers.deployContract("contracts/upgradeability/04-initialize/VaultV1B.sol:VaultV1B");
    const factory = await ethers.deployContract("VaultFactory", [await v1.getAddress()]);
    const beacon = await ethers.getContractAt("UpgradeableBeacon", await factory.beacon());

    const vaults = [];
    for (const [i, user] of users.entries()) {
      await factory.createVault(user.address);
      const vault = await ethers.getContractAt("VaultV2", await factory.vaults(i));
      await vault.connect(user).deposit({ value: DEPOSITS[i] });
      vaults.push(vault);
    }
    return { deployer, users, factory, beacon, vaults };
  }

  it("each vault is a VaultBeaconProxy that points to the beacon, not to the implementation", async function () {
    const { users, factory, beacon, vaults } = await networkHelpers.loadFixture(deployFixture);

    expect(await factory.vaultsCount()).to.equal(3n);
    for (const [i, vault] of vaults.entries()) {
      expect(await readAddressSlot(ethers.provider, await vault.getAddress(), BEACON_SLOT)).to.equal(
        await beacon.getAddress(),
      );
      expect(await vault.owner()).to.equal(users[i].address);
      expect(await vault.version()).to.equal(1n);
    }
  });

  it("one beacon.upgradeTo(v2) upgrades all 3 vaults, balances intact", async function () {
    const { deployer, users, beacon, vaults } = await networkHelpers.loadFixture(deployFixture);
    const v2 = await ethers.deployContract("VaultV2");

    await beacon.connect(deployer).upgradeTo(await v2.getAddress());

    for (const [i, vault] of vaults.entries()) {
      expect(await vault.version()).to.equal(2n);
      expect(await vault.owner()).to.equal(users[i].address);
      expect(await vault.totalDeposits()).to.equal(DEPOSITS[i]);
      expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(DEPOSITS[i]);
    }
  });

  it("initializeV2 is NOT run by the upgrade: it must be called on each vault", async function () {
    const { deployer, users, beacon, vaults } = await networkHelpers.loadFixture(deployFixture);
    const v2 = await ethers.deployContract("VaultV2");
    await beacon.connect(deployer).upgradeTo(await v2.getAddress());

    // The beacon has no upgradeToAndCall: each proxy has its own storage to migrate.
    for (const vault of vaults) expect(await vault.fee()).to.equal(0n);

    const fees = [10n, 20n, 30n];
    for (const [i, vault] of vaults.entries()) {
      await vault.connect(users[i]).initializeV2(fees[i]);
    }

    for (const [i, vault] of vaults.entries()) {
      expect(await vault.fee()).to.equal(fees[i]);
      await expect(vault.connect(users[i]).initializeV2(99n)).to.be.revertedWithCustomError(
        vault,
        "InvalidInitialization",
      );
    }
  });

  it("only the beacon owner can upgrade", async function () {
    const { users, beacon } = await networkHelpers.loadFixture(deployFixture);
    const v2 = await ethers.deployContract("VaultV2");

    await expect(beacon.connect(users[0]).upgradeTo(await v2.getAddress()))
      .to.be.revertedWithCustomError(beacon, "OwnableUnauthorizedAccount")
      .withArgs(users[0].address);
  });
});
