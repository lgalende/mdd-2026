import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// npx hardhat ignition deploy ignition/modules/Token.ts --network sepolia --verify
// npx hardhat ignition wipe chain-11155111 TokenModule#Token
export default buildModule("TokenModule", (m) => {
  const name = "MDD Token";
  const symbol = "MDD26";
  const initialSupply = 0n;
  const initialSupplyRecipient = "0x";

  const token = m.contract("Token", [name, symbol]);

  return { token };
});
