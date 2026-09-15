# mdd-2026

A [Hardhat 3](https://hardhat.org/docs/getting-started) project using TypeScript, `mocha` for tests, `ethers` v6 for Ethereum interactions, and Hardhat Ignition for deployments. `forge-std` is installed, so Foundry-compatible Solidity tests (`*.t.sol`) can be added alongside the TypeScript ones.

The project contains `Token`, an ERC20 built on [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/5.x/erc20) v5:

- extends `ERC20` — standard transfers, allowances and metadata;
- extends `ERC20Burnable` — holders can `burn` their own tokens or `burnFrom` an approved balance;
- extends `Ownable` — only the owner can `mint`.

The constructor takes `(name, symbol, initialSupply, initialOwner)` and mints the initial supply to the owner.

## Requirements

- Node.js >= 22 (Hardhat 3 requires it)
- npm >= 10

## How this project was initialized

These are the exact commands used to scaffold the repository from an empty directory:

```shell
# Scaffold a Hardhat 3 project with the mocha + ethers template.
# This creates package.json, hardhat.config.ts, contracts/, test/, ignition/,
# scripts/, tsconfig.json and a base .gitignore, then installs all dependencies.
npx hardhat@3 --init --template mocha-ethers
```

Hardhat's `--init` is interactive by default: it asks for the project root, the
template, and whether to install dependencies. Passing `--template mocha-ethers`
answers those prompts up front so it also runs in a non-interactive shell (CI,
scripts, agents). The available templates are:

| Template | Test runner | Ethereum library |
| --- | --- | --- |
| `mocha-ethers` | Mocha + Chai | ethers v6 |
| `node-test-runner-viem` | Node.js built-in test runner | viem |
| `minimal` | — | — |

Run `npx hardhat@3 --init --templates` to list them.

The scaffold installs these dev dependencies:

```shell
npm install --save-dev hardhat@^3.16.0 \
  @nomicfoundation/hardhat-toolbox-mocha-ethers \
  @nomicfoundation/hardhat-ethers \
  @nomicfoundation/hardhat-ignition \
  ethers mocha chai typescript \
  @types/node @types/mocha @types/chai @types/chai-as-promised \
  forge-std@github:foundry-rs/forge-std#v1.16.2
```

OpenZeppelin Contracts is not part of the template and was added afterwards:

```shell
npm install --save-dev @openzeppelin/contracts
```

To get a working copy of an existing clone, only this is needed:

```shell
npm install
```

## Project layout

```
contracts/              Solidity sources (*.sol)
test/                   TypeScript tests (mocha + ethers)
ignition/modules/       Hardhat Ignition deployment modules
scripts/                Standalone scripts run with `hardhat run`
hardhat.config.ts       Networks, Solidity profiles and plugins
tsconfig.json           TypeScript configuration
remappings.txt          Import remappings for editors/Foundry (Hardhat resolves via npm)
.env.example            Template for the local .env (never commit .env itself)
```

## Commands

### Compile

```shell
npx hardhat compile                       # default profile
npx hardhat compile --build-profile production   # with the optimizer enabled
```

### Test

```shell
npx hardhat test              # all tests
npx hardhat test solidity     # only the Solidity (*.t.sol) tests
npx hardhat test mocha        # only the TypeScript tests
```

Coverage and gas reporting are global options on any task:

```shell
npx hardhat test --coverage
npx hardhat test --gas-stats
```

### Type-check

```shell
npx tsc --noEmit
```

Compile first — the TypeScript tests import generated artifact types.

### Console and local node

```shell
npx hardhat console            # REPL against a simulated chain
npx hardhat node               # JSON-RPC server on http://127.0.0.1:8545
```

### Run a script

```shell
npx hardhat run <script> --network <network>
```

[`scripts/fund-addresses.ts`](scripts/fund-addresses.ts) sends 0.01 SepoliaETH to each
address in its `RECIPIENTS` list — edit the list and `AMOUNT` at the top of the
file, then:

```shell
npx hardhat run scripts/fund-addresses.ts --network sepolia
```

### Clean

```shell
npx hardhat clean              # remove artifacts and the compilation cache
```

### Flatten

```shell
npx hardhat flatten contracts/Token.sol
```

See [Verifying the source code](#verifying-the-source-code) for verification.

## Networks

`hardhat.config.ts` defines:

- `hardhatMainnet` — a simulated L1 chain (default for tests).
- `hardhatOp` — a simulated OP Stack chain, for testing L2-specific behaviour.
- `sepolia` — a real network over HTTP, configured through the
  `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` configuration variables.

## Configuration variables

`hardhat.config.ts` reads `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` through
`configVariable(...)`, which resolves from `process.env` or from the encrypted
keystore. **Hardhat does not read `.env` on its own** — `hardhat.config.ts` imports
`dotenv/config` at the top to load it.

### Option 1 — `.env` (local development)

Copy the template and fill it in:

```shell
cp .env.example .env
```

```dotenv
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<your-api-key>
SEPOLIA_PRIVATE_KEY=0x<your-private-key>
```

`.env` is gitignored; `.env.example` is committed.

### Option 2 — encrypted keystore (recommended for private keys)

The keystore stores values encrypted on disk instead of in plaintext, and prompts
for a password when a task needs them:

```shell
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat keystore list
```

Plain environment variables also work, with no `.env` file:

```shell
SEPOLIA_RPC_URL=... SEPOLIA_PRIVATE_KEY=... npx hardhat ignition deploy ignition/modules/Token.ts --network sepolia
```

## Verifying the source code

Verification uploads the source so explorers can show it next to the bytecode.
`hardhat-verify` ships with the toolbox, and all three providers are enabled by
default. Sourcify and Blockscout need no API key; Etherscan does, read from
`ETHERSCAN_API_KEY` (see [Configuration variables](#configuration-variables)).

Because `Token`'s constructor takes four arguments, put them in a module rather
than passing them on the command line — this guarantees they match the deployment
exactly, which is what verification compares against:

```ts
// verify-args.ts
export default ["Test Token", "TST", 1000000000000000000000000n, "0xYourOwnerAddress"];
```

```shell
# all enabled providers at once
npx hardhat verify --network sepolia <address> --constructor-args-path verify-args.ts

# or one provider
npx hardhat verify etherscan --network sepolia <address> --constructor-args-path verify-args.ts
npx hardhat verify blockscout --network sepolia <address> --constructor-args-path verify-args.ts
npx hardhat verify sourcify --network sepolia <address> --constructor-args-path verify-args.ts
```

With no constructor arguments, the address alone is enough:

```shell
npx hardhat verify --network sepolia <address>
```

### Verifying an Ignition deployment

Ignition records the deployed addresses and constructor arguments, so it can
verify without repeating them. Either verify as part of the deploy:

```shell
npx hardhat ignition deploy ignition/modules/Token.ts --network sepolia --verify
```

or verify a deployment that already happened:

```shell
npx hardhat ignition verify chain-11155111
```

### Useful flags

| Flag | Purpose |
| --- | --- |
| `--contract contracts/Token.sol:Token` | Disambiguate when several contracts share a bytecode match |
| `--force` | Re-verify a contract the explorer already considers verified |
| `--libraries-path <file>` | Supply linked library addresses |
| `--creation-tx-hash <hash>` | Point Sourcify at the creation transaction |

If verification fails with a bytecode mismatch, the usual cause is compiling with
a different build profile than the one used to deploy. Pass the same
`--build-profile` to both commands.

## Deployments (Hardhat Ignition)

Deploy to a simulated chain:

```shell
npx hardhat ignition deploy ignition/modules/Token.ts
```

Deploy to Sepolia (requires the configuration variables above):

```shell
npx hardhat ignition deploy ignition/modules/Token.ts --network sepolia
```

Inspect past deployments:

```shell
npx hardhat ignition status chain-11155111
npx hardhat ignition deployments
```

The module's `name`, `symbol`, `initialSupply` and `initialOwner` are Ignition
parameters with defaults, so a deployment can be customised without editing the
module:

```shell
npx hardhat ignition deploy ignition/modules/Token.ts --parameters params.json
```

```json
{ "TokenModule": { "symbol": "ABC", "initialSupply": "5000000000000000000000" } }
```

Deployment state under `ignition/deployments/` is committed for real networks so
deployments are resumable and auditable; local chain state (`chain-31337`) is ignored.

### Redeploying after changing a contract

Ignition reconciles a run against its journal, not against your source. Once a
future has executed successfully it is skipped on the next `deploy`, so **editing
a contract does not cause a redeploy** — the run reports nothing to do and the old
bytecode stays on chain. Ignition only reacts to changes in the module itself
(future IDs, constructor arguments), never to recompiled bytecode.

To force a redeploy, clear the recorded state first. Wipe a single future:

```shell
npx hardhat ignition wipe <deploymentId> <futureId>
# e.g.
npx hardhat ignition wipe chain-11155111 TokenModule#Token
npx hardhat ignition deploy ignition/modules/Token.ts --network sepolia
```

Or discard the whole deployment and start over:

```shell
npx hardhat ignition deploy ignition/modules/Token.ts --network sepolia --reset
```

Or leave the old deployment untouched and run a new one beside it:

```shell
npx hardhat ignition deploy ignition/modules/Token.ts --network sepolia --deployment-id token-v2
```

All three produce a **new contract address** — the previous contract stays on
chain, so update anything that references it. `deployed_addresses.json` and
`status` are the source of truth for what is live:

```shell
cat ignition/deployments/chain-11155111/deployed_addresses.json
```

To check whether the deployed bytecode still matches your source, compare the
artifact Ignition stored at deploy time with a fresh build:

```shell
npx hardhat ignition deployments        # list deployment ids
diff <(jq -S .abi ignition/deployments/chain-11155111/artifacts/'TokenModule#Token'.json) \
     <(jq -S .abi artifacts/contracts/Token.sol/Token.json)
```

Deployments to real networks use the `production` build profile (optimizer on),
while local runs and tests use `default`. Pass the same `--build-profile` when
verifying, or the bytecode will not match.
