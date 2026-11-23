import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

describe("01 - call vs delegatecall", function () {
  async function deployFixture() {
    const [user] = await ethers.getSigners();
    const logic = await ethers.deployContract("Logic");
    const caller = await ethers.deployContract("Caller", [await logic.getAddress()]);
    return { user, logic, caller };
  }

  it("call: runs in Logic's context, so Logic.x changes", async function () {
    const { logic, caller } = await networkHelpers.loadFixture(deployFixture);

    await caller.callSetX(42);

    expect(await logic.x()).to.equal(42n);
    expect(await caller.x()).to.equal(0n);
  });

  it("delegatecall: runs Logic's code in Caller's context, so Caller.x changes", async function () {
    const { logic, caller } = await networkHelpers.loadFixture(deployFixture);

    await caller.delegatecallSetX(42);

    expect(await caller.x()).to.equal(42n);
    expect(await logic.x()).to.equal(0n);
  });

  it("call: msg.sender is Caller, address(this) is Logic, event emitted by Logic", async function () {
    const { logic, caller } = await networkHelpers.loadFixture(deployFixture);

    // The event comes from Logic's address: it ran as itself.
    await expect(caller.callSetX(42))
      .to.emit(logic, "XSet")
      .withArgs(await caller.getAddress(), await logic.getAddress(), 42n);
  });

  it("delegatecall: msg.sender is the EOA, address(this) is Caller, event emitted by Caller", async function () {
    const { user, logic, caller } = await networkHelpers.loadFixture(deployFixture);

    const tx = await caller.delegatecallSetX(42);
    const receipt = await tx.wait();

    // The log is emitted from Caller's address even though the code is Logic's.
    expect(receipt!.logs).to.have.length(1);
    const log = receipt!.logs[0];
    expect(log.address).to.equal(await caller.getAddress());

    const event = logic.interface.parseLog(log)!;
    expect(event.name).to.equal("XSet");
    expect(event.args.sender).to.equal(user.address); // msg.sender is preserved
    expect(event.args.self).to.equal(await caller.getAddress()); // address(this) is the caller
  });

  it("delegatecall writes by SLOT, not by name: Caller.logic (slot 1) is untouched", async function () {
    const { logic, caller } = await networkHelpers.loadFixture(deployFixture);

    await caller.delegatecallSetX(42);

    expect(await caller.logic()).to.equal(await logic.getAddress());
    expect(await ethers.provider.getStorage(await caller.getAddress(), 0)).to.equal(ethers.toBeHex(42, 32));
  });
});
