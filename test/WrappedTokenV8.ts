import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";
import { expect } from "chai";
import { network } from "hardhat";
import type { WrappedTokenV8 } from "../types/ethers-contracts/index.js";

const { ethers } = await network.create();

const NAME = "MDD Wrapped Token";
const SYMBOL = "MDD-WETH";

describe("WrappedTokenV8", function () {
  const amount = ethers.parseEther("5");
  let token: WrappedTokenV8, owner: HardhatEthersSigner, alice: HardhatEthersSigner, bob: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    token = await ethers.deployContract("WrappedTokenV8", [NAME, SYMBOL, owner.address]);
    await token.connect(alice).deposit(amount, { value: amount });
  });

  describe("addToBlacklist", function () {
    it("should add the account to the blacklist", async function () {
      await expect(token.connect(owner).addToBlacklist(bob.address))
        .to.emit(token, "Blacklisted")
        .withArgs(bob.address);

      expect(await token.isBlacklisted(bob.address)).to.equal(true);
    });

    it("should revert if the account is already blacklisted", async function () {
      await token.connect(owner).addToBlacklist(bob.address);

      await expect(token.connect(owner).addToBlacklist(bob.address)).to.be.revertedWith(
        "Account is already blacklisted",
      );
    });

    it("should revert if the caller is not the owner", async function () {
      await expect(token.connect(bob).addToBlacklist(alice.address))
        .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
        .withArgs(bob.address);
    });
  });

  describe("transfer", function () {
    it("should revert if the sender is blacklisted", async function () {
      await token.connect(owner).addToBlacklist(alice.address);

      await expect(token.connect(alice).transfer(bob.address, amount)).to.be.revertedWith("Sender is blacklisted");
    });

    it("should revert if the recipient is blacklisted", async function () {
      await token.connect(owner).addToBlacklist(bob.address);

      await expect(token.connect(alice).transfer(bob.address, amount)).to.be.revertedWith(
        "Recipient is blacklisted",
      );
    });

    it("should cost the same no matter the size of the blacklist", async function () {
      // the first transfer to Bob sets his balance from 0, which costs more than the next ones, so it is not measured
      await token.connect(alice).transfer(bob.address, 1n);

      const gasUsed: bigint[] = [];
      const sizes = [0, 10, 100, 500];
      let blacklistLength = 0;
      for (const size of sizes) {
        for (; blacklistLength < size; blacklistLength++) {
          await token.connect(owner).addToBlacklist(ethers.Wallet.createRandom().address);
        }

        const tx = await token.connect(alice).transfer(bob.address, 1n);
        const receipt = await tx.wait();
        gasUsed.push(receipt!.gasUsed);
      }
      console.table(sizes.map((size, i) => ({ "blacklist size": size, "transfer gas": Number(gasUsed[i]) })));

      // every transfer reads one value for the sender and one for the recipient
      for (let i = 1; i < gasUsed.length; i++) {
        expect(gasUsed[i]).to.equal(gasUsed[0]);
      }
    });
  });

  describe("deposit", function () {
    it("should revert if the caller is blacklisted", async function () {
      await token.connect(owner).addToBlacklist(bob.address);

      // minting calls `_update` with `to = bob`
      await expect(token.connect(bob).deposit(amount, { value: amount })).to.be.revertedWith(
        "Recipient is blacklisted",
      );
    });
  });

  describe("withdraw", function () {
    it("should revert if the caller is blacklisted", async function () {
      await token.connect(owner).addToBlacklist(alice.address);

      // burning calls `_update` with `from = alice`: her ETH stays locked in the contract
      await expect(token.connect(alice).withdraw()).to.be.revertedWith("Sender is blacklisted");
    });
  });
});
