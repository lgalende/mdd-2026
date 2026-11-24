// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract VaultUUPSV2 is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    uint256 public totalDeposits;
    uint256 public fee; // new, at the end

    constructor() {
        _disableInitializers();
    }

    /// @custom:oz-upgrades-validate-as-initializer
    function initializeV2(uint256 fee_) external reinitializer(2) onlyOwner {
        fee = fee_;
    }

    // Locked ETH. There is no `withdraw`, so every deposited wei stays in the proxy forever
    function deposit() external payable {
        totalDeposits += msg.value;
    }

    function version() external pure returns (uint256) {
        return 2;
    }

    // V2 must keep UUPSUpgradeable + the auth check, or the proxy can never be upgraded again.
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
