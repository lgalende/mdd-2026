import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import { expect } from "chai";
import { network } from "hardhat";
import type { WrappedTokenV4B } from "../types/ethers-contracts/index.js";

const { ethers } = await network.create();

const NAME = "MDD Wrapped Token";
const SYMBOL = "MDD-WETH";

describe("WrappedTokenV4B", function () {
  const amount = ethers.parseEther("5");
  let token: WrappedTokenV4B, owner: HardhatEthersSigner, alice: HardhatEthersSigner, bob: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    token = await ethers.deployContract("WrappedTokenV4B", [NAME, SYMBOL, owner.address]);
    await token.connect(alice).deposit(amount, { value: amount });
  });

  describe("withdraw", function () {
    it("should burn tokens and transfer ETH", async function () {
      const contractEthBalanceBefore = await ethers.provider.getBalance(token.getAddress());
      const aliceEthBalanceBefore = await ethers.provider.getBalance(alice.address);

      const tx = await token.connect(alice).withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt!.fee;

      const contractEthBalanceAfter = await ethers.provider.getBalance(token.getAddress());
      expect(contractEthBalanceAfter).to.equal(contractEthBalanceBefore - amount);

      const aliceTokenBalanceAfter = await token.balanceOf(alice.address);
      expect(aliceTokenBalanceAfter).to.equal(0n);

      const aliceEthBalanceAfter = await ethers.provider.getBalance(alice.address);
      expect(aliceEthBalanceAfter).to.equal(aliceEthBalanceBefore + amount - gasUsed);
    });

    it("should allow withdrawing again after a withdraw finishes", async function () {
      // the lock is released at the end of withdraw, so the next call is not blocked
      await token.connect(alice).withdraw();
      await token.connect(alice).deposit(amount, { value: amount });

      await token.connect(alice).withdraw();
      expect(await token.balanceOf(alice.address)).to.equal(0n);
    });

    it("should revert if the caller re-enters withdraw", async function () {
      const attacker = await ethers.deployContract("ReentrancyAttacker", [await token.getAddress()], bob);

      // The burn still happens after the ETH transfer, like in V3, but the reentrant withdraw reverts with
      // "Reentrant call", so the outer ETH transfer fails
      await expect(attacker.connect(bob).attack({ value: ethers.parseEther("1") })).to.be.revertedWith(
        "ETH transfer failed",
      );
    });

    it("[vulnerability]", async function () {
      // the attacker re-enters transfer, which is not locked, and moves its tokens out before they are burned
      const attacker = await ethers.deployContract("CrossFunctionReentrancyAttacker", [await token.getAddress()], bob);

      const contractEthBalanceBefore = await ethers.provider.getBalance(token.getAddress());
      const bobEthBalanceBefore = await ethers.provider.getBalance(bob.address);

      // Bob gets his 5 ETH back and still holds 5 tokens
      const attackTx = await attacker.connect(bob).attack({ value: amount });
      const attackReceipt = await attackTx.wait();
      expect(await token.balanceOf(bob.address)).to.equal(amount);

      // Bob withdraws again with the same tokens and takes Alice's deposit
      const withdrawTx = await token.connect(bob).withdraw();
      const withdrawReceipt = await withdrawTx.wait();
      const gasUsed = attackReceipt!.fee + withdrawReceipt!.fee;

      const contractEthBalanceAfter = await ethers.provider.getBalance(token.getAddress());
      expect(contractEthBalanceAfter).to.equal(0n);

      const bobEthBalanceAfter = await ethers.provider.getBalance(bob.address);
      expect(bobEthBalanceAfter).to.equal(bobEthBalanceBefore + contractEthBalanceBefore - gasUsed);

      // Alice's balance is still recorded, but there is no ETH left to pay it
      expect(await token.balanceOf(alice.address)).to.equal(amount);
    });
  });

  describe("emergencyWithdraw", function () {
    it("should transfer all ETH to the specified recipient", async function () {
      const contractEthBalanceBefore = await ethers.provider.getBalance(token.getAddress());
      const bobEthBalanceBefore = await ethers.provider.getBalance(bob.address);

      await token.connect(owner).emergencyWithdraw(bob.address);

      const contractEthBalanceAfter = await ethers.provider.getBalance(token.getAddress());
      expect(contractEthBalanceAfter).to.equal(0n);

      const bobEthBalanceAfter = await ethers.provider.getBalance(bob.address);
      expect(bobEthBalanceAfter).to.equal(bobEthBalanceBefore + contractEthBalanceBefore);
    });

    it("should revert if the caller is not the owner", async function () {
      await expect(token.connect(bob).emergencyWithdraw(bob.address)).to.be.revertedWith("Caller is not the owner");
    });
  });
});
