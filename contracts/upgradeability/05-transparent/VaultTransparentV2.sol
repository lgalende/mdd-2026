// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract VaultTransparentV2 is Initializable, OwnableUpgradeable {
    uint256 public totalDeposits;
    uint256 public fee; // new, at the end

    constructor() {
        _disableInitializers();
    }

    // No onlyOwner: msg.sender here is the ProxyAdmin (it forwards the call in upgradeAndCall).
    // Call it through `upgradeAndCall` so it runs in the same tx as the upgrade: upgrading with
    // empty data and calling it later would let anyone run it first and pick the fee.
    /// @custom:oz-upgrades-validate-as-initializer
    function initializeV2(uint256 fee_) external reinitializer(2) {
        fee = fee_;
    }

    // Locked ETH. There is no `withdraw`, so every deposited wei stays in the proxy forever
    function deposit() external payable {
        totalDeposits += msg.value;
    }

    function version() external pure returns (uint256) {
        return 2;
    }
}
