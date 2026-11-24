// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Hand-made proxy. DO NOT USE: it has BUG 1 on purpose, plus a few simplifications.
contract MiniProxy {
    // BUG 1: storage collision. `implementation` sits in slot 0, the same slot as the implementation's
    // first variable (`VaultV1.owner`). Writing `owner` overwrites the implementation address and bricks
    // the proxy. Fixed in `MiniProxy1967` with EIP-1967 slots
    address public implementation; // slot 0

    // Immutable lives in the bytecode, not in storage. If it were a regular
    // variable it would sit in slot 1 and collide with VaultV1.totalDeposits:
    // every deposit would overwrite the admin.
    // Non-transferable admin. An immutable can never change, so a lost or compromised admin key
    // can't be rotated. Fixed in OZ's `TransparentUpgradeableProxy` (the `ProxyAdmin` is `Ownable`)
    address public immutable admin;

    error NotAdmin();

    constructor(address implementation_) {
        implementation = implementation_;
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    // Function selector clash. `implementation()`, `admin()` and `upgradeTo()` are handled by the
    // proxy, so an implementation function with the same selector is unreachable through it.
    // Fixed in OZ's `TransparentUpgradeableProxy` (the admin can only upgrade, users can only use the app)
    // No code check. Nothing stops upgrading to an address without code (e.g. an EOA): every call
    // then "succeeds" doing nothing. Fixed in OZ's `ERC1967Utils.upgradeToAndCall`
    // No `Upgraded` event. Off-chain tools and explorers can't track upgrades, as EIP-1967 requires.
    // Fixed in OZ's `ERC1967Utils.upgradeToAndCall`
    function upgradeTo(address newImplementation) external onlyAdmin {
        implementation = newImplementation;
    }

    /// @dev Any selector not defined above is forwarded with delegatecall:
    /// the implementation's code runs against THIS contract's storage and balance.
    fallback() external payable {
        _delegate(implementation);
    }

    /// @dev Plain ETH transfers (empty calldata) are forwarded too, so the implementation decides.
    receive() external payable {
        _delegate(implementation);
    }

    function _delegate(address impl) private {
        assembly {
            // Copy calldata to memory at 0
            calldatacopy(0, 0, calldatasize())
            // Forward all gas, keep msg.sender and msg.value
            let ok := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            // Bubble up whatever came back (return data or revert reason)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
