// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice WRONG: the constructor runs once, at deploy time, against the
/// IMPLEMENTATION's storage. DO NOT USE behind a proxy.
contract VaultWithConstructor {
    address public owner;
    uint256 public totalDeposits;

    // BUG 4: state set in the constructor. It only writes the implementation's storage, so through
    // the proxy `owner()` is `address(0)`. Fixed in `VaultInit` (`initialize` + `initializer`)
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
