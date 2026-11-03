// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev This contract is used for educational purposes only. It is not intended for production use and may contain vulnerabilities.
 * Do not use this contract in production environments.
 */
contract WrappedTokenV1 is ERC20 {
  constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
  }

  /**
   * @dev Receives ETH and mints corresponding tokens.
   * `payable` to accept ETH
   * `msg.value` is the amount of ETH sent when calling the function
   * `msg.sender` is the address of the caller of the function
   */
  function deposit(uint256 amount) external payable {
    require(msg.value == amount, "Incorrect ETH amount sent");
    _mint(msg.sender, amount);
  }

  /**
   * @dev Transfers the caller's whole balance in ETH and burns their tokens.
   * `msg.sender` is the address of the caller of the function
   * `call` is used to transfer ETH from the contract balance. If `msg.sender` is a contract,
   * its `receive` function is executed before this function finishes
   */
  function withdraw() external {
    require(balanceOf(msg.sender) > 0, "Insufficient balance");

    // BUG 3: reentrancy. ETH is sent before the tokens are burned, so `msg.sender` takes control from its `receive`
    // function while its balance is still the same. It can re-enter `withdraw` to get paid again, or call `transfer`
    // to move the tokens to another account that withdraws them again. Fixed in `WrappedTokenV4A`
    (bool success, ) = msg.sender.call{value: balanceOf(msg.sender)}("");
    require(success, "ETH transfer failed");

    _burn(msg.sender, balanceOf(msg.sender));
  }

  /**
   * Withdraws all ETH from the contract. 
   * It is intended to be used in case there is a bug in the contract and the contract needs to be drained.
   * `recipient` is the address that will receive the ETH
   * `address(this).balance` is the current ETH balance of the contract
   * `call` is used to transfer ETH from the contract balance
   */
  function emergencyWithdraw(address recipient) external {
    // BUG 1: missing access control. Anyone can call this function and drain the contract. Fixed in `WrappedTokenV2`
    uint256 contractBalance = address(this).balance;
    require(contractBalance > 0, "No ETH to withdraw");

    (bool success, ) = recipient.call{value: contractBalance}("");
    require(success, "ETH transfer failed");
  }
}
