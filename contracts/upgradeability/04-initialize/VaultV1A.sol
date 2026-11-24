// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/// @notice `initialize` replaces the constructor and `initializer` makes it run only once.
contract VaultV1A is Initializable {
    address public owner;
    uint256 public totalDeposits;

    error NotOwner();
    error TransferFailed();

    // BUG 4: uninitialized implementation. Nobody initializes the implementation contract itself, so
    // anyone can call `initialize` on it directly, become its owner and `withdraw` any ETH sent to the
    // implementation address by mistake. Fixed in `VaultV1B` (`_disableInitializers()` in the constructor)
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
