// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Holds the code. Its own `x` only changes when called with a regular `call`.
contract Logic {
    uint256 public x; // slot 0

    /// @dev Logs who called and whose storage/address the code is running in.
    event XSet(address sender, address self, uint256 value);

    function setX(uint256 value) external {
        x = value;
        emit XSet(msg.sender, address(this), value);
    }
}
