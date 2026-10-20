import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import { expect } from "chai";
import { network } from "hardhat";
import type { WrappedTokenV5 } from "../types/ethers-contracts/index.js";

const { ethers } = await network.create();

const NAME = "MDD Wrapped Token";
const SYMBOL = "MDD-WETH";

describe("WrappedTokenV5", function () {
  const amount = ethers.parseEther("5");
  let token: WrappedTokenV5, owner: HardhatEthersSigner, alice: HardhatEthersSigner, bob: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    token = await ethers.deployContract("WrappedTokenV5", [NAME, SYMBOL, owner.address]);
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

    it("should revert if the caller re-enters withdraw", async function () {
      const attacker = await ethers.deployContract("ReentrancyAttacker", [await token.getAddress()], bob);

      // The reentrant withdraw reverts with ReentrancyGuardReentrantCall, so the outer ETH transfer fails
      await expect(attacker.connect(bob).attack({ value: ethers.parseEther("1") })).to.be.revertedWith(
        "ETH transfer failed",
      );
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
      await expect(token.connect(bob).emergencyWithdraw(bob.address))
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(bob.address);
    });

    it("should revert if a malicious contract calls it on behalf of the owner", async function () {
      const attacker = await ethers.deployContract("TxOriginAttacker", [await token.getAddress()], bob);

      await expect(attacker.connect(owner).claimAirdrop())
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(await attacker.getAddress());
    });
  });
});
