// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { BeaconProxy } from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";

/// @notice OZ's BeaconProxy as is. It asks the beacon for the implementation on every call.
contract VaultBeaconProxy is BeaconProxy {
    constructor(address beacon, bytes memory data) payable BeaconProxy(beacon, data) {}
}
