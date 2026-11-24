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
    // BUG 5: front-runnable migration. `reinitializer(2)` is only safe if it runs atomically inside
    // `upgradeAndCall`. If the admin upgrades with empty data, the first caller picks the fee.
    // Fixed in `VaultV2` (owner check) and `VaultUUPSV2` (`onlyOwner`)
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
