// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { UpgradeableBeacon } from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import { VaultBeaconProxy } from "./VaultBeaconProxy.sol";
import { VaultV1B } from "../04-initialize/VaultV1B.sol";

/// @notice Many proxies, one beacon: upgrading the beacon upgrades every vault in one tx.
contract VaultFactory {
    UpgradeableBeacon public immutable beacon;
    address[] public vaults;

    event VaultCreated(address indexed vault, address indexed owner);

    /// @dev msg.sender owns the beacon, so only they can upgrade all vaults.
    constructor(address implementation) {
        beacon = new UpgradeableBeacon(implementation, msg.sender);
    }

    /// @dev Each VaultBeaconProxy asks the beacon for the implementation on every call.
    function createVault(address owner) external returns (address vault) {
        vault = address(new VaultBeaconProxy(address(beacon), abi.encodeCall(VaultV1B.initialize, (owner))));
        vaults.push(vault);
        emit VaultCreated(vault, owner);
    }

    function vaultsCount() external view returns (uint256) {
        return vaults.length;
    }
}
