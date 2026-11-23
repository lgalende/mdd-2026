// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Logic } from "./Logic.sol";

/// @notice Same layout as Logic for slot 0, so a delegatecall writes our own `x`.
contract Caller {
    uint256 public x; // slot 0, must match Logic.x
    address public logic; // slot 1, Logic never touches it

    constructor(address logic_) {
        logic = logic_;
    }

    /// @dev Runs Logic's code in Logic's context: Logic.x changes, msg.sender is this contract.
    function callSetX(uint256 value) external {
        (bool ok, ) = logic.call(abi.encodeCall(Logic.setX, (value)));
        require(ok, "call failed");
    }

    /// @dev Runs Logic's code in OUR context: our x changes, msg.sender is still the EOA.
    function delegatecallSetX(uint256 value) external {
        (bool ok, ) = logic.delegatecall(abi.encodeCall(Logic.setX, (value)));
        require(ok, "delegatecall failed");
    }
}
