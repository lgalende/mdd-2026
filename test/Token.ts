import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

const NAME = "MDD Token Test";
const SYMBOL = "MDDT";
const INITIAL_SUPPLY = ethers.parseEther("10");

async function deployToken() {
  const [alice, bob] = await ethers.getSigners();
  const token = await ethers.deployContract("Token", [
    NAME,
    SYMBOL,
  ]);

  return { token, alice, bob };
}

describe("Token", function () {
  describe("deployment", function () {
    it("Should set the name, symbol and decimals", async function () {
      const { token } = await deployToken();

      expect(await token.name()).to.equal(NAME);
      expect(await token.symbol()).to.equal(SYMBOL);
      expect(await token.decimals()).to.equal(18n);

      console.log("Token name:", await token.name());
      console.log("Token symbol:", await token.symbol());
      console.log("Token decimals:", await token.decimals());
    });

    it("Should not mint anything to alice and bob", async function () {
      const { token, alice, bob } = await deployToken();

      expect(await token.totalSupply()).to.equal(0n);
      expect(await token.balanceOf(alice.address)).to.equal(0n);
      expect(await token.balanceOf(bob.address)).to.equal(0n);

      console.log("Total supply:", await token.totalSupply());
      console.log("Alice balance:", await token.balanceOf(alice.address));
      console.log("Bob balance:", await token.balanceOf(bob.address));
    });
  });

  describe("transfers", function () {
    it("Should emit the Transfer event and move the balances", async function () {
      const { token, bob, alice } = await deployToken();
      const amount = ethers.parseEther("100");

      await expect(token.connect(bob).transfer(alice.address, amount))
        .to.emit(token, "Transfer")
        .withArgs(bob.address, alice.address, amount);

      expect(await token.balanceOf(alice.address)).to.equal(amount);
      expect(await token.balanceOf(bob.address)).to.equal(INITIAL_SUPPLY - amount);
    });

    it("Should revert when the sender has an insufficient balance", async function () {
      const { token, alice, bob } = await deployToken();

      await expect(token.connect(alice).transfer(bob.address, 1n))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
        .withArgs(alice.address, 0n, 1n);
    });
  });
});
