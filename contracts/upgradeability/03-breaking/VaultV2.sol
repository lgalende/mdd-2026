// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Correct upgrade: old variables keep their slots, new ones go at the END.
contract VaultV2 {
    address public owner; // slot 0 (same as V1)
    uint256 public totalDeposits; // slot 1 (same as V1)
    uint256 public fee; // slot 2, new

    // BUG 2: unprotected initializer. Anyone can call it, at any time, and set the fee.
    // Fixed in `VaultInitV2` (`reinitializer(2)` + owner check)
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
