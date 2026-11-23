// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice First version of the conducting example.
contract VaultV1 {
    address public owner; // slot 0
    uint256 public totalDeposits; // slot 1

    // BUG 2: unprotected initializer. Anyone can call it, at any time, and become the owner.
    // No guard on purpose: behind MiniProxy, `owner` reads the implementation address (slot 0),
    // so a `require(owner == address(0))` would always revert. Fixed in `VaultInit` (`initializer`)
    function initialize(address owner_) external {
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
