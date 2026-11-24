// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { TransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

/// @notice OZ's transparent proxy as is. It deploys its own `ProxyAdmin`, owned by `initialOwner`.
contract VaultTransparentProxy is TransparentUpgradeableProxy {
    constructor(
        address implementation,
        address initialOwner,
        bytes memory data
    ) payable TransparentUpgradeableProxy(implementation, initialOwner, data) {}
}
