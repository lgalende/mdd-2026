// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice DO NOT USE: see BUG 6.
// BUG 6: non-upgradeable OZ dependency. `Ownable` (from @openzeppelin/contracts, not -upgradeable) sets
// `_owner` in its constructor, so it only exists in the implementation's storage. Through the proxy
// `owner()` is `address(0)`, nobody passes `onlyOwner` and the proxy can never be upgraded again.
// It also stores `_owner` in slot 0 instead of a namespaced slot, shifting the layout (`totalDeposits`
// moves to slot 1), so it can't be swapped for `OwnableUpgradeable` later.
// Fixed in `VaultUUPSV1B` (`OwnableUpgradeable` + `__Ownable_init` in `initialize`)
contract VaultUUPSV1A is Initializable, Ownable, UUPSUpgradeable {
    uint256 public totalDeposits; // slot 1, `Ownable._owner` takes slot 0

    constructor(address owner_) Ownable(owner_) {
        _disableInitializers();
    }

    // Empty: the developer believes the owner is already set by the constructor.
    function initialize() external initializer {}

    // Locked ETH. There is no `withdraw`, so every deposited wei stays in the proxy forever
    function deposit() external payable {
        totalDeposits += msg.value;
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
