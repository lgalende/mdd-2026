import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

const NAME = "MMD Token";
const SYMBOL = "MMD26";
const INITIAL_SUPPLY = ethers.parseEther("1000000");

async function deployToken() {
  const [owner, alice, bob] = await ethers.getSigners();
  const token = await ethers.deployContract("Token", [
    NAME,
    SYMBOL,
    INITIAL_SUPPLY,
    owner.address,
  ]);

  return { token, owner, alice, bob };
}

describe("Token", function () {
  describe("deployment", function () {
    it("Should set the name, symbol and decimals", async function () {
      const { token } = await deployToken();

      expect(await token.name()).to.equal(NAME);
      expect(await token.symbol()).to.equal(SYMBOL);
      expect(await token.decimals()).to.equal(18n);
    });

    // it("Should mint the initial supply to the owner", async function () {
    //   const { token, owner } = await deployToken();

    //   expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
    //   expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
    //   expect(await token.owner()).to.equal(owner.address);
    // });

    it("Should not mint anything when the initial supply is zero", async function () {
      const [owner] = await ethers.getSigners();
      const token = await ethers.deployContract("Token", [NAME, SYMBOL, 0n, owner.address]);

      expect(await token.totalSupply()).to.equal(0n);
    });
  });

  describe("transfers", function () {
    it("Should emit the Transfer event and move the balances", async function () {
      const { token, owner, alice } = await deployToken();
      const amount = ethers.parseEther("100");

      await expect(token.transfer(alice.address, amount))
        .to.emit(token, "Transfer")
        .withArgs(owner.address, alice.address, amount);

      expect(await token.balanceOf(alice.address)).to.equal(amount);
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY - amount);
    });

    it("Should revert when the sender has an insufficient balance", async function () {
      const { token, alice, bob } = await deployToken();

      await expect(token.connect(alice).transfer(bob.address, 1n))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
        .withArgs(alice.address, 0n, 1n);
    });

    it("Should spend the allowance on transferFrom", async function () {
      const { token, owner, alice, bob } = await deployToken();
      const allowance = ethers.parseEther("100");
      const amount = ethers.parseEther("40");

      await expect(token.approve(alice.address, allowance))
        .to.emit(token, "Approval")
        .withArgs(owner.address, alice.address, allowance);

      await token.connect(alice).transferFrom(owner.address, bob.address, amount);

      expect(await token.balanceOf(bob.address)).to.equal(amount);
      expect(await token.allowance(owner.address, alice.address)).to.equal(allowance - amount);
    });

    it("Should revert transferFrom when the allowance is insufficient", async function () {
      const { token, owner, alice, bob } = await deployToken();

      await expect(token.connect(alice).transferFrom(owner.address, bob.address, 1n))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance")
        .withArgs(alice.address, 0n, 1n);
    });
  });

  // describe("mint", function () {
  //   it("Should let the owner mint new tokens", async function () {
  //     const { token, alice } = await deployToken();
  //     const amount = ethers.parseEther("500");

  //     await expect(token.mint(alice.address, amount))
  //       .to.emit(token, "Transfer")
  //       .withArgs(ethers.ZeroAddress, alice.address, amount);

  //     expect(await token.balanceOf(alice.address)).to.equal(amount);
  //     expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY + amount);
  //   });

  //   it("Should revert when a non-owner mints", async function () {
  //     const { token, alice } = await deployToken();

  //     await expect(token.connect(alice).mint(alice.address, 1n))
  //       .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
  //       .withArgs(alice.address);
  //   });
  // });

  // describe("burn", function () {
  //   it("Should burn the caller's tokens and reduce the total supply", async function () {
  //     const { token, owner } = await deployToken();
  //     const amount = ethers.parseEther("250");

  //     await expect(token.burn(amount))
  //       .to.emit(token, "Transfer")
  //       .withArgs(owner.address, ethers.ZeroAddress, amount);

  //     expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY - amount);
  //     expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY - amount);
  //   });

  //   it("Should revert when burning more than the balance", async function () {
  //     const { token, alice } = await deployToken();

  //     await expect(token.connect(alice).burn(1n))
  //       .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
  //       .withArgs(alice.address, 0n, 1n);
  //   });
  // });
});
