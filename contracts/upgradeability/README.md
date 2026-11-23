# Hands-on class: upgradeability in Solidity

Running example: a `Vault` with `owner`, `totalDeposits`, `deposit()` and `version()`.
V2 adds `fee` **at the end**, `initializeV2(uint256)` and `version() == 2`.

Proxies are deployed by hand with ethers (`ethers.deployContract("ERC1967Proxy", ...)`), not with
`upgrades.deployProxy`, so the mechanics stay visible. The `@openzeppelin/hardhat-upgrades` plugin
is only used for `validateUpgrade` (block 3).

Every bug is marked in the contracts with a `// BUG N:` comment (repeated in each contract where it
is still present). Tests that show a bug **pass** by asserting the broken behavior; look for the
`// This is BUG N` comments.

| Bug | Where | Fixed in |
|-----|-------|----------|
| BUG 1: storage collision (implementation in slot 0) | `MiniProxy` | `MiniProxy1967` |
| BUG 2: unprotected initializer | `VaultV1`, `VaultV2Broken`, `VaultV2` | `VaultInit`, `VaultInitV2` |
| BUG 3: storage layout shift | `VaultV2Broken` | `VaultV2` |
| BUG 4: state set in the constructor | `VaultWithConstructor` | `VaultInit` |
| BUG 5: uninitialized implementation | `VaultInit` | `VaultInitSecure` |
| BUG 6: missing upgrade authorization | `VaultUUPSInsecure` | `VaultUUPS` |
| BUG 7: non-upgradeable OZ dependency (`Ownable` instead of `OwnableUpgradeable`) | `VaultUUPSNonUpgradeableOwnable` | `VaultUUPS` |
| BUG 8: front-runnable migration | `VaultTransparentV2` | `VaultInitV2`, `VaultUUPSV2` |

Some issues are left on purpose to keep the code short. They are explained in comments but not
labeled as bugs, since OpenZeppelin's contracts already solve them:

- The hand-made proxies (`MiniProxy`, `MiniProxy1967`) have function selector clashes, no code
  check on upgrade, no `Upgraded` event and a non-transferable admin.
- No vault has a `withdraw`, so deposited ETH is locked forever.

## Setup

Requires Node.js >= 22.

```shell
npm install
npx hardhat build
```

## Running each block

```shell
npx hardhat test test/upgradeability/01-*.ts   # call vs delegatecall
npx hardhat test test/upgradeability/02-*.ts   # hand-made MiniProxy
npx hardhat test test/upgradeability/03-*.ts   # collision, layout, validateUpgrade
npx hardhat test test/upgradeability/04-*.ts   # constructor vs initialize
npx hardhat test test/upgradeability/05-*.ts   # OpenZeppelin UUPS and Transparent
npx hardhat test test/upgradeability/06-*.ts   # Beacon

# All blocks
npx hardhat test mocha test/upgradeability/*.ts

# deposit() gas per pattern (block 5), with Hardhat 3's gas reporter
npx hardhat test test/upgradeability/05-*.ts --gas-stats
```

Scripts:

```shell
# Storage layouts side by side (VaultV1, VaultV2Broken, VaultV2 by default)
npx hardhat run scripts/layout.ts
LAYOUT_CONTRACTS=VaultUUPS,VaultUUPSNonUpgradeableOwnable npx hardhat run scripts/layout.ts
```

`scripts/slots.ts` has helpers to read raw storage (`readSlot`, `readAddressSlot`, `dumpSlots`)
and the EIP-1967 slot constants.

## Class outline (~115 min)

| # | Block | Time | Contracts | What it shows |
|---|-------|------|-----------|---------------|
| 1 | `01-delegatecall` | 10 min | `Caller`, `Logic` | `call` changes `Logic`'s `x`; `delegatecall` changes `Caller`'s. The event shows `msg.sender` and `address(this)` in each case. |
| 2 | `02-mini-proxy` | 20 min | `MiniProxy`, `VaultV1` | A ~30-line proxy with `fallback` + `delegatecall`, used as a `VaultV1` via `getContractAt`. State and ETH live in the proxy. |
| 3 | `03-breaking` | 20 min | `VaultV2Broken`, `MiniProxy1967`, `VaultV2` | `initialize(alice)` overwrites slot 0 (implementation) and bricks the proxy. Fix with EIP-1967 slots. Upgrading with `fee` in the middle corrupts `totalDeposits`; with `fee` at the end everything is preserved. `scripts/layout.ts` and `validateUpgrade`. |
| 4 | `04-initialize` | 10 min | `VaultWithConstructor`, `VaultInit`, `VaultInitSecure`, `VaultInitV2` | The constructor never runs in the proxy. `initializer` prevents re-initialization. Attack: initializing the implementation. Fix with `_disableInitializers()`. `reinitializer(2)` inside `upgradeToAndCall`. |
| 5 | `05-oz` | 25 min | `VaultUUPS`, `VaultUUPSV2`, `VaultUUPSInsecure`, `VaultUUPSNonUpgradeableOwnable`, `VaultTransparent`, `VaultTransparentV2` | UUPS: upgrade from the implementation, `onlyOwner` in `_authorizeUpgrade` (and what happens without it). Using `@openzeppelin/contracts` instead of `-upgradeable` freezes the proxy. Transparent: `ProxyAdmin` read from the admin slot, `upgradeAndCall`, `ProxyDeniedAdminAccess`. Gas comparison. |
| 6 | `06-beacon` | 10 min | `VaultFactory` | 3 `BeaconProxy` vaults; a single `beacon.upgradeTo(v2)` upgrades all of them. `initializeV2` must be called on each one. |
| 7 | Exercises | 20 min | | |

## Notes

- `MiniProxy` keeps `admin` as an `immutable` (in the bytecode, not in storage). As a regular
  variable it would take slot 1 and every `VaultV1.deposit()` would overwrite it. This way the
  only collision in the class is the slot 0 one, which is the one we want to show.
- `VaultV1.initialize` has no guard on purpose: behind `MiniProxy`, `owner` reads the
  implementation address, so a `require(owner == address(0))` would always revert.
- The OpenZeppelin proxies (`ERC1967Proxy`, `TransparentUpgradeableProxy`, `ProxyAdmin`,
  `UpgradeableBeacon`) are compiled through `solidity.npmFilesToBuild` in `hardhat.config.ts`,
  because Hardhat 3 only emits artifacts for npm files imported directly by project sources.
- The storage layout is added to the build-info via `outputSelection` in `hardhat.config.ts`.
