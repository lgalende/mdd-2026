// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @notice OZ's ERC1967Proxy as is. It has no upgrade logic: in UUPS that lives in the implementation.
contract VaultUUPSProxy is ERC1967Proxy {
    constructor(address implementation, bytes memory data) payable ERC1967Proxy(implementation, data) {}
}
