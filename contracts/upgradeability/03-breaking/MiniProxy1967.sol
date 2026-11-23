// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { StorageSlot } from "@openzeppelin/contracts/utils/StorageSlot.sol";

/// @notice MiniProxy with BUG 1 fixed: implementation and admin live in pseudo-random
/// EIP-1967 slots that no compiler-assigned variable will ever reach. Still simplified: see comments below.
contract MiniProxy1967 {
    /// @dev keccak256("eip1967.proxy.implementation") - 1. The -1 makes the
    /// preimage unknown, so no mapping/array can be crafted to land here.
    bytes32 public constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    /// @dev keccak256("eip1967.proxy.admin") - 1
    bytes32 public constant ADMIN_SLOT = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

    error NotAdmin();

    // Non-transferable admin. There is no function to change the admin slot.
    // Fixed in OZ's `TransparentUpgradeableProxy` (the `ProxyAdmin` is `Ownable`)
    constructor(address implementation_, bytes memory data) {
        StorageSlot.getAddressSlot(ADMIN_SLOT).value = msg.sender;
        _upgradeToAndCall(implementation_, data);
    }

    modifier onlyAdmin() {
        if (msg.sender != StorageSlot.getAddressSlot(ADMIN_SLOT).value) revert NotAdmin();
        _;
    }

    // Function selector clash. `upgradeTo()`, `upgradeToAndCall()` and the public constants are
    // handled by the proxy, so an implementation function with the same selector is unreachable.
    // Fixed in OZ's `TransparentUpgradeableProxy`
    function upgradeTo(address newImplementation) external onlyAdmin {
        _upgradeToAndCall(newImplementation, "");
    }

    /// @dev Upgrade + migration call in the same tx, so nobody can front-run the init.
    function upgradeToAndCall(address newImplementation, bytes calldata data) external onlyAdmin {
        _upgradeToAndCall(newImplementation, data);
    }

    // No code check. Upgrading to an address without code makes every call "succeed" doing nothing.
    // No `Upgraded` event, as EIP-1967 requires. Both fixed in OZ's `ERC1967Utils.upgradeToAndCall`
    function _upgradeToAndCall(address newImplementation, bytes memory data) private {
        StorageSlot.getAddressSlot(IMPLEMENTATION_SLOT).value = newImplementation;
        if (data.length > 0) {
            (bool ok, bytes memory ret) = newImplementation.delegatecall(data);
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }

    fallback() external payable {
        address impl = StorageSlot.getAddressSlot(IMPLEMENTATION_SLOT).value;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
