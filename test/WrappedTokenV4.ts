import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import { expect } from "chai";
import { network } from "hardhat";
import type { WrappedTokenV4 } from "../types/ethers-contracts/index.js";

const { ethers } = await network.create();

const NAME = "MDD Wrapped Token";
const SYMBOL = "MDD-WETH";

describe("WrappedTokenV4", function () {
  const amount = ethers.parseEther("5");
  let token: WrappedTokenV4, owner: HardhatEthersSigner, alice: HardhatEthersSigner, bob: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    token = await ethers.deployContract("WrappedTokenV4", [NAME, SYMBOL, owner.address]);
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

      // The reentrant withdraw reverts with "Insufficient balance", so the outer ETH transfer fails
      await expect(attacker.connect(bob).attack({ value: ethers.parseEther("1") })).to.be.revertedWith(
        "ETH transfer failed",
      );
    });
  });
});
