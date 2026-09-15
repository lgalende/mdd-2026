import { network } from "hardhat";

// npx hardhat run scripts/fund-addresses.ts --network sepolia
const RECIPIENTS = [
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
];

const AMOUNT = "0.01";

const { ethers } = await network.create();
const [sender] = await ethers.getSigners();

for (const to of RECIPIENTS) {
  const tx = await sender.sendTransaction({ to, value: ethers.parseEther(AMOUNT) });
  await tx.wait();
  console.log(`Sent ${AMOUNT} ETH to ${to}: ${tx.hash}`);
}
