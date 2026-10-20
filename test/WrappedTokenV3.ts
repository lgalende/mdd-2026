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
    it("should transfer ETH to an EOA", async function () {
      const aliceEthBalanceBefore = await ethers.provider.getBalance(alice.address);

      // an EOA has no code, so receiving ETH only increases its balance
      const tx = await token.connect(alice).withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt!.fee;

      const aliceEthBalanceAfter = await ethers.provider.getBalance(alice.address);
      expect(aliceEthBalanceAfter).to.equal(aliceEthBalanceBefore + amount - gasUsed);
      expect(await token.balanceOf(alice.address)).to.equal(0n);
    });

    it("should transfer ETH to a smart contract and execute its receive function", async function () {
      const wallet = await ethers.deployContract("SmartWallet", [await token.getAddress()], bob);
      await wallet.connect(bob).deposit({ value: amount });

      const walletEthBalanceBefore = await ethers.provider.getBalance(wallet.getAddress());

      // a smart contract has code, so receiving ETH executes its receive function
      await expect(wallet.connect(bob).withdraw())
        .to.emit(wallet, "Received")
        .withArgs(await token.getAddress(), amount);

      const walletEthBalanceAfter = await ethers.provider.getBalance(wallet.getAddress());
      expect(walletEthBalanceAfter).to.equal(walletEthBalanceBefore + amount);
      expect(await token.balanceOf(wallet.getAddress())).to.equal(0n);
    });

    it("[vulnerability]", async function () {
      // the attacker re-enters withdraw and drains the deposits of other users
      const attacker = await ethers.deployContract("ReentrancyAttacker", [await token.getAddress()], bob);
      const attackAmount = ethers.parseEther("1");

      const contractEthBalanceBefore = await ethers.provider.getBalance(token.getAddress());
      const bobEthBalanceBefore = await ethers.provider.getBalance(bob.address);

      // Bob sends 1 ETH and gets back 6 ETH: Bob's deposit plus Alice's
      const tx = await attacker.connect(bob).attack({ value: attackAmount });
      const receipt = await tx.wait();
      const gasUsed = receipt!.fee;

      const contractEthBalanceAfter = await ethers.provider.getBalance(token.getAddress());
      expect(contractEthBalanceAfter).to.equal(0n);

      const bobEthBalanceAfter = await ethers.provider.getBalance(bob.address);
      expect(bobEthBalanceAfter).to.equal(bobEthBalanceBefore + contractEthBalanceBefore - gasUsed);

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
