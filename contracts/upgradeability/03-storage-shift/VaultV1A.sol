// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Same as VaultV1 from block 2, used behind MiniProxy1967 in this block.
contract VaultV1A {
    address public owner; // slot 0
    uint256 public totalDeposits; // slot 1

    // No access control. Anyone can call it and become the owner
    function setOwner(address owner_) external {
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
