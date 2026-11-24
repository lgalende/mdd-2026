// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { MiniProxy1967 } from "../03-storage-shift/MiniProxy1967.sol";

/// @notice MiniProxy1967 as is: EIP-1967 slots, admin-only `upgradeTo` / `upgradeToAndCall`.
contract VaultInitProxy is MiniProxy1967 {
    constructor(address implementation, bytes memory data) MiniProxy1967(implementation, data) {}
}
