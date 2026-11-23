// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice WRONG upgrade of VaultV1. DO NOT USE.
contract VaultV2Broken {
    address public owner; // slot 0
    // BUG 3: storage layout shift. `fee` was inserted before `totalDeposits`, so after the upgrade `fee`
    // reads V1's `totalDeposits` and `totalDeposits` reads an empty slot. Fixed in `VaultV2` (`fee` at the end)
    uint256 public fee; // slot 1 <- was totalDeposits in V1, so it inherits its value
    uint256 public totalDeposits; // slot 2 <- new slot, starts at 0

    // BUG 2: unprotected initializer. Anyone can call it, at any time, and set the fee
    function initializeV2(uint256 fee_) external {
        fee = fee_;
    }

    // Locked ETH. There is no `withdraw`, so every deposited wei stays in the proxy forever
    function deposit() external payable {
        totalDeposits += msg.value;
    }

    function version() external pure returns (uint256) {
        return 2;
    }
}
