import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import { expect } from "chai";
import { network } from "hardhat";
import type { WrappedTokenV1 } from "../types/ethers-contracts/index.js";

const { ethers } = await network.create();

const NAME = "MDD Wrapped Token";
const SYMBOL = "MDD-WETH";

describe("WrappedTokenV1", function () {
  let token: WrappedTokenV1, alice: HardhatEthersSigner, bob: HardhatEthersSigner;

  beforeEach(async function () {
    [alice, bob] = await ethers.getSigners();
    token = await ethers.deployContract("WrappedTokenV1", [
      NAME,
      SYMBOL,
    ]);
  });

  describe("deposit", function () {
    const amount = ethers.parseEther("1");
    
    it("should receive ETH and mint tokens", async function () {
      const tokenBalanceBefore = await ethers.provider.getBalance(token.getAddress());
      const aliceBalanceBefore = await token.balanceOf(alice.address);

      await token.connect(alice).deposit(amount, { value: amount });

      const tokenBalanceAfter = await ethers.provider.getBalance(token.getAddress());
      expect(tokenBalanceAfter).to.equal(tokenBalanceBefore + amount);

      const aliceBalanceAfter = await token.balanceOf(alice.address);
      expect(aliceBalanceAfter).to.equal(aliceBalanceBefore + amount);
    });

    it("should revert if the sent ETH amount does not match the specified amount", async function () {
      await expect(token.connect(alice).deposit(amount, { value: amount + 1n })).to.be.revertedWith("Incorrect ETH amount sent");
    });
  });

  describe("withdraw", function () {
    const amount = ethers.parseEther("0.1");

    beforeEach(async function () {
      await token.connect(alice).deposit(amount * 3n, { value: amount * 3n });
    });
    
    it("should burn tokens and transfer ETH", async function () {
      const tokenBalanceBefore = await ethers.provider.getBalance(token.getAddress());
      const aliceBalanceBefore = await token.balanceOf(alice.address);
      const aliceEthBalanceBefore = await ethers.provider.getBalance(alice.address);

      const tx = await token.connect(alice).withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt!.fee;

      const tokenBalanceAfter = await ethers.provider.getBalance(token.getAddress());
      expect(tokenBalanceAfter).to.equal(tokenBalanceBefore - aliceBalanceBefore);

      const aliceBalanceAfter = await token.balanceOf(alice.address);
      expect(aliceBalanceAfter).to.equal(0n);

      const aliceEthBalanceAfter = await ethers.provider.getBalance(alice.address);
      expect(aliceEthBalanceAfter).to.equal(aliceEthBalanceBefore + aliceBalanceBefore - gasUsed);
    });

    it("should revert if the user has no balance", async function () {
      await expect(token.connect(bob).withdraw()).to.be.revertedWith("Insufficient balance");
    });
  });

  describe("emergencyWithdraw", function () {
    const amount = ethers.parseEther("0.5");

    beforeEach(async function () {
      await token.connect(alice).deposit(amount, { value: amount });
    });

    it("should transfer all ETH to the specified recipient", async function () {
      const recipient = bob.address;
      const tokenBalanceBefore = await ethers.provider.getBalance(token.getAddress());
      const recipientBalanceBefore = await ethers.provider.getBalance(recipient);

      await token.connect(alice).emergencyWithdraw(recipient);

      const tokenBalanceAfter = await ethers.provider.getBalance(token.getAddress());
      expect(tokenBalanceAfter).to.equal(0n);

      const recipientBalanceAfter = await ethers.provider.getBalance(recipient);
      expect(recipientBalanceAfter).to.equal(recipientBalanceBefore + tokenBalanceBefore);
    });

    it("[vulnerability]", async function () {
      // Missing access control: anyone can drain the contract
      const tokenBalanceBefore = await ethers.provider.getBalance(token.getAddress());
      const bobEthBalanceBefore = await ethers.provider.getBalance(bob.address);

      const tx = await token.connect(bob).emergencyWithdraw(bob.address);
      const receipt = await tx.wait();
      const gasUsed = receipt!.fee;

      const tokenBalanceAfter = await ethers.provider.getBalance(token.getAddress());
      expect(tokenBalanceAfter).to.equal(0n);

      const bobEthBalanceAfter = await ethers.provider.getBalance(bob.address);
      expect(bobEthBalanceAfter).to.equal(bobEthBalanceBefore + tokenBalanceBefore - gasUsed);
    });
  });
});
