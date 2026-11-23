// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @notice DO NOT USE: see BUG 6.
contract VaultUUPSInsecure is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    uint256 public totalDeposits;

    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_) external initializer {
        __Ownable_init(owner_);
    }

    // Locked ETH. There is no `withdraw`, so every deposited wei stays in the proxy forever
    function deposit() external payable {
        totalDeposits += msg.value;
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    // BUG 6: missing upgrade authorization. `_authorizeUpgrade` has no `onlyOwner`, so anyone can call
    // `upgradeToAndCall` and replace the implementation with their own code. Fixed in `VaultUUPS`
    function _authorizeUpgrade(address) internal override {}
}
