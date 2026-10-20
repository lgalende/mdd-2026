// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {WrappedTokenV3} from "./WrappedTokenV3.sol";

/**
 * @dev Minimal smart contract wallet used to show how a contract receives ETH.
 */
contract SmartWallet {
  event Received(address indexed sender, uint256 amount);

  WrappedTokenV3 public immutable token;

  constructor(WrappedTokenV3 token_) {
    token = token_;
  }

  function deposit() external payable {
    token.deposit{value: msg.value}(msg.value);
  }

  function withdraw() external {
    token.withdraw();
  }

  /**
   * @dev Executed when the contract receives ETH with empty calldata, e.g. `call{value: amount}("")`.
   * Without a `receive` (or payable `fallback`) function, the ETH transfer would revert.
   */
  receive() external payable {
    emit Received(msg.sender, msg.value);
  }
}
