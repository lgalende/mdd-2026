// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/// @notice VaultV1A + the fix: lock the implementation at deploy time.
contract VaultV1B is Initializable {
    address public owner;
    uint256 public totalDeposits;

    error NotOwner();
    error TransferFailed();

    /// @dev Runs on the implementation only (never through the proxy), so it
    /// marks the implementation as initialized forever. Proxies are not affected.
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_) external initializer {
        owner = owner_;
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
        return 1;
    }
}
