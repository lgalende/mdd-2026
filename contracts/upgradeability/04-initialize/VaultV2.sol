// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/// @notice V2 of VaultV1B: same layout + `fee` at the end.
contract VaultV2 is Initializable {
    address public owner;
    uint256 public totalDeposits;
    uint256 public fee; // new, at the end

    error NotOwner();
    error TransferFailed();

    constructor() {
        _disableInitializers();
    }

    /// @dev `initializer` would revert here (version 1 already used).
    /// `reinitializer(2)` runs once per proxy when moving to version 2.
    /// Owner-gated because, unlike in the same upgrade tx, it could be front-run
    /// when called later (e.g. beacon proxies in block 7).
    /// @custom:oz-upgrades-validate-as-initializer
    function initializeV2(uint256 fee_) external reinitializer(2) {
        if (msg.sender != owner) revert NotOwner();
        fee = fee_;
    }

    function deposit() external payable {
        totalDeposits += msg.value;
    }

    function withdraw() external {
        if (msg.sender != owner) revert NotOwner();
        totalDeposits = 0;
        (bool ok, ) = owner.call{ value: address(this).balance }("");
        if (!ok) revert TransferFailed();
    }

    function version() external pure returns (uint256) {
        return 2;
    }
}
