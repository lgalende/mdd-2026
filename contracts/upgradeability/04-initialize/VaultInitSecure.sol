// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/// @notice VaultInit + the fix: lock the implementation at deploy time.
contract VaultInitSecure is Initializable {
    address public owner;
    uint256 public totalDeposits;

    /// @dev Runs on the implementation only (never through the proxy), so it
    /// marks the implementation as initialized forever. Proxies are not affected.
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_) external initializer {
        owner = owner_;
    }

    // Locked ETH. There is no `withdraw`, so every deposited wei stays in the proxy forever
    function deposit() external payable {
        totalDeposits += msg.value;
    }

    function version() external pure returns (uint256) {
        return 1;
    }
}
