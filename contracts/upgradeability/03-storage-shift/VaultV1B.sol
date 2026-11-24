// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice VaultV1A written as a regular (non-proxied) contract: `owner` is set in the constructor.
contract VaultV1B {
    address public owner;
    uint256 public totalDeposits;

    // BUG 2: state set in the constructor. It runs once, at deploy time, against the IMPLEMENTATION's
    // storage, so through the proxy `owner()` is `address(0)`. Fixed in `04-initialize/VaultV1A` (`initialize` + `initializer`)
    constructor(address owner_) {
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
