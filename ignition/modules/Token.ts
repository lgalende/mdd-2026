import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const INITIAL_SUPPLY = 1_000_000n * 10n ** 18n;

// npx hardhat ignition deploy ignition/modules/Token.ts --network sepolia --verify
// npx hardhat ignition wipe chain-11155111 TokenModule#Token
export default buildModule("TokenModule", (m) => {
  const name = m.getParameter("name", "Test Token");
  const symbol = m.getParameter("symbol", "TST");
  const initialSupply = m.getParameter("initialSupply", INITIAL_SUPPLY);
  const initialOwner = m.getParameter("initialOwner", m.getAccount(0));

  const token = m.contract("Token", [name, symbol, initialSupply, initialOwner]);

  return { token };
});
