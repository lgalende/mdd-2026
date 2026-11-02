// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev This contract is used for educational purposes only. It is not intended for production use.
 * Do not use this contract in production environments.
 *
 * Combines `WrappedTokenV4A` and `WrappedTokenV4B`: `withdraw` follows the checks-effects-interactions pattern
 * and is protected with a lock. The repeated checks are moved into the `onlyOwner` and `nonReentrant` modifiers.
 *
 * Why both are needed:
 * - Checks-effects-interactions keeps the state consistent whenever `msg.sender` takes control, so it also protects
 *   functions without the lock, such as `transfer` (see `WrappedTokenV4B`). But it only works if every change keeps
 *   the right order, and some external calls are hard to spot
 * - `nonReentrant` does not depend on the order, so it still stops re-entering `withdraw` if the order breaks.
 *   But it only protects the functions that use it
 */
contract WrappedTokenV5 is ERC20 {
  address public owner;

  /**
   * `locked` is true while a `nonReentrant` function is running
   */
  bool private locked;

  /**
   * @dev Reverts if `msg.sender` is not the owner.
   * `_;` is replaced by the body of the function that uses the modifier
   */
  modifier onlyOwner() {
    require(msg.sender == owner, "Caller is not the owner");
    _;
  }

  /**
   * @dev Reverts if a `nonReentrant` function of this contract is already running.
   * The code before `_;` runs before the function body and the code after `_;` runs after it
   */
  modifier nonReentrant() {
    require(!locked, "Reentrant call");
    locked = true;
    _;
    locked = false;
  }

  /**
   * `owner_` is the address allowed to call `emergencyWithdraw`
   */
  constructor(string memory name_, string memory symbol_, address owner_) ERC20(name_, symbol_) {
    owner = owner_;
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
   * Follows the checks-effects-interactions pattern.
   * `nonReentrant` reverts if this function, or any other `nonReentrant` function of this contract,
   * is called again before it finishes
   */
  function withdraw() external nonReentrant {
    uint256 amount = balanceOf(msg.sender);
    require(amount > 0, "Insufficient balance");

    _burn(msg.sender, balanceOf(msg.sender));

    (bool success, ) = msg.sender.call{value: amount}("");
    require(success, "ETH transfer failed");
  }

  /**
   * Withdraws all ETH from the contract.
   * It is intended to be used in case there is a bug in the contract and the contract needs to be drained.
   * Modifiers run in order, from left to right: first `onlyOwner`, then `nonReentrant`
   * `recipient` is the address that will receive the ETH
   * `address(this).balance` is the current ETH balance of the contract
   * `call` is used to transfer ETH from the contract balance
   */
  function emergencyWithdraw(address recipient) external onlyOwner nonReentrant {
    uint256 contractBalance = address(this).balance;
    require(contractBalance > 0, "No ETH to withdraw");

    (bool success, ) = recipient.call{value: contractBalance}("");
    require(success, "ETH transfer failed");
  }
}
