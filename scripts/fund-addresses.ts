import { network } from "hardhat";

// npx hardhat run scripts/fund-addresses.ts --network sepolia
const RECIPIENTS = [
  "0xd73d34733c56Ddfeb685E75ba1F4a8a643012803",
];

const AMOUNT = "0.01";

const { ethers } = await network.create();
const [sender] = await ethers.getSigners();

for (const to of RECIPIENTS) {
  const tx = await sender.sendTransaction({ to, value: ethers.parseEther(AMOUNT) });
  await tx.wait();
  console.log(`Sent ${AMOUNT} ETH to ${to}: ${tx.hash}`);
}
