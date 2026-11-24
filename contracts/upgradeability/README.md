# Hands-on class: upgradeability in Solidity

Running example: a `Vault` with `owner`, `totalDeposits`, `deposit()` and `version()`.
`VaultV2Broken` adds `fee` and `version() == 2`.

Proxies are deployed by hand with ethers (`ethers.deployContract("VaultUUPSProxy", ...)`), not with
`upgrades.deployProxy`, so the mechanics stay visible. The `@openzeppelin/hardhat-upgrades` plugin
is only used for `validateUpgrade` (block 3).

Every bug is marked in the contracts with a `// BUG N:` comment (repeated in each contract where it
is still present). Tests that show a bug **pass** by asserting the broken behavior; look for the
`// This is BUG N` comments.

| Bug | Where | Fixed in |
|-----|-------|----------|
| BUG 1: storage collision (implementation in slot 0) | `MiniProxy` | `MiniProxy1967` |
| BUG 2: state set in the constructor (`owner`) | `03-storage-shift/VaultV1` | `VaultV1A` (`initialize` + `initializer`) |
| BUG 3: storage layout shift | `VaultV2Broken` | add new variables at the end |
| BUG 4: uninitialized implementation | `VaultV1A` | `VaultV1B` |
| BUG 5: front-runnable migration | `VaultTransparentV2` | `VaultV2`, `VaultUUPSV2` |
| BUG 6: non-upgradeable OZ dependency (`Ownable` instead of `OwnableUpgradeable`) | `VaultUUPSV1A` | `VaultUUPSV1B` |

Some issues are left on purpose to keep the code short. They are explained in comments but not
labeled as bugs, since OpenZeppelin's contracts already solve them:

- The hand-made proxies (`MiniProxy`, `MiniProxy1967`) have function selector clashes, no code
  check on upgrade, no `Upgraded` event and a non-transferable admin.
- No vault has a `withdraw`, so deposited ETH is locked forever.
- `setOwner` in `02-storage-collision/VaultV1` and `VaultV2Broken` has no access control, and `VaultV2Broken.initialize` has no guard.

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
npx hardhat test test/upgradeability/03-*.ts   # collision, constructor, layout, validateUpgrade
npx hardhat test test/upgradeability/04-*.ts   # constructor vs initialize
npx hardhat test test/upgradeability/05-*.ts   # OpenZeppelin Transparent
npx hardhat test test/upgradeability/06-*.ts   # OpenZeppelin UUPS + gas comparison
npx hardhat test test/upgradeability/07-*.ts   # Beacon

# All blocks
npx hardhat test mocha test/upgradeability/*.ts

# deposit() gas per pattern (block 6), with Hardhat 3's gas reporter
npx hardhat test test/upgradeability/06-*.ts --gas-stats
```

Scripts:

```shell
# Storage layouts side by side (VaultV1 from block 2 and VaultV2Broken by default)
npx hardhat run scripts/layout.ts
LAYOUT_CONTRACTS=VaultUUPSV1B,VaultUUPSV1A npx hardhat run scripts/layout.ts
```

`scripts/slots.ts` has helpers to read raw storage (`readSlot`, `readAddressSlot`, `dumpSlots`)
and the EIP-1967 slot constants.

## Class outline (~115 min)

| # | Block | Time | Contracts | What it shows |
|---|-------|------|-----------|---------------|
| 1 | `01-delegatecall` | 10 min | `Caller`, `Logic` | `call` changes `Logic`'s `x`; `delegatecall` changes `Caller`'s. The event shows `msg.sender` and `address(this)` in each case. |
| 2 | `02-storage-collision` | 20 min | `MiniProxy`, `VaultV1` | A ~30-line proxy with `fallback` + `delegatecall`, used as a `VaultV1` via `getContractAt`. State and ETH live in the proxy. |
| 3 | `03-storage-shift` | 20 min | `MiniProxy1967`, `VaultV1`, `VaultV2Broken` | `setOwner(alice)` overwrites slot 0 (implementation) and bricks the proxy. Fix with EIP-1967 slots. A `VaultV1` that sets `owner` in its constructor has `owner() == address(0)` through the proxy. Upgrading to a V2 with `fee` in the middle corrupts `totalDeposits`. `scripts/layout.ts` and `validateUpgrade`. |
| 4 | `04-initialize` | 10 min | `VaultInitProxy`, `VaultV1A`, `VaultV1B`, `VaultV2` | `initialize` replaces the constructor and `initializer` prevents re-initialization. Attack: initializing the implementation. Fix with `_disableInitializers()`. `reinitializer(2)` inside `upgradeToAndCall`. |
| 5 | `05-transparent` | 10 min | `VaultTransparentProxy`, `VaultTransparentV1`, `VaultTransparentV2` | `ProxyAdmin` read from the admin slot, `upgradeAndCall`, `ProxyDeniedAdminAccess`. |
| 6 | `06-uups` | 15 min | `VaultUUPSProxy`, `VaultUUPSV1B`, `VaultUUPSV2`, `VaultUUPSV1A` | UUPS: upgrade from the implementation, `onlyOwner` in `_authorizeUpgrade`. Using `@openzeppelin/contracts` instead of `-upgradeable` freezes the proxy. Gas comparison with Transparent. |
| 7 | `07-beacon` | 10 min | `VaultFactory`, `VaultBeaconProxy` | 3 `VaultBeaconProxy` vaults; a single `beacon.upgradeTo(v2)` upgrades all of them. `initializeV2` must be called on each one. |
| 8 | Exercises | 20 min | | |

## Notes

- `MiniProxy` keeps `admin` as an `immutable` (in the bytecode, not in storage). As a regular
  variable it would take slot 1 and every `VaultV1.deposit()` would overwrite it. This way the
  only collision in the class is the slot 0 one, which is the one we want to show.
- `VaultV1.setOwner` has no `onlyOwner` on purpose: behind `MiniProxy`, `owner` reads the
  implementation address, so the check would lock everyone out.
- `VaultInitProxy`, `VaultTransparentProxy`, `VaultUUPSProxy` and `VaultBeaconProxy` are empty contracts
  that inherit `MiniProxy1967` and OZ's `TransparentUpgradeableProxy`, `ERC1967Proxy` and `BeaconProxy`,
  so each block has its proxy next to its implementations.
- `ProxyAdmin`, `UpgradeableBeacon` and `ITransparentUpgradeableProxy` are compiled through
  `solidity.npmFilesToBuild` in `hardhat.config.ts`, because Hardhat 3 only emits artifacts for
  project sources and the npm files listed there.
- The storage layout is added to the build-info via `outputSelection` in `hardhat.config.ts`.
- There are two `VaultV1` contracts (`02-storage-collision/` and `03-storage-shift/`). Tests and `LAYOUT_CONTRACTS` refer to them
  by fully qualified name, e.g. `contracts/upgradeability/02-storage-collision/VaultV1.sol:VaultV1`.
