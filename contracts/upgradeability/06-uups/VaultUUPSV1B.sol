// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @notice UUPS: the upgrade logic lives in the IMPLEMENTATION, the proxy (VaultUUPSProxy) is dumb.
contract VaultUUPSV1B is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    // OwnableUpgradeable uses ERC-7201 namespaced storage, so this is slot 0.
    uint256 public totalDeposits;

    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_) external initializer {
        __Ownable_init(owner_);
    }

    // Locked ETH. There is no `withdraw`, so every deposited wei stays in the proxy forever
    function deposit() external payable {
        totalDeposits += msg.value;
    }

    function version() external pure virtual returns (uint256) {
        return 1;
    }

    /// @dev The whole security of UUPS is this check. Forget it and anyone can upgrade.
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
