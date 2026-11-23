// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/// @notice `initialize` replaces the constructor and `initializer` makes it run only once.
contract VaultInit is Initializable {
    address public owner;
    uint256 public totalDeposits;

    // BUG 5: uninitialized implementation. Nobody initializes the implementation contract itself, so
    // anyone can call `initialize` on it directly and become its owner. In a UUPS implementation that
    // owner could upgrade it. Fixed in `VaultInitSecure` (`_disableInitializers()` in the constructor)
    function initialize(address owner_) external initializer {
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
