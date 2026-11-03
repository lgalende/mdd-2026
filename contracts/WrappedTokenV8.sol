// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @dev This contract is used for educational purposes only. It is not intended for production use.
 * Do not use this contract in production environments.
 *
 * Same as `WrappedTokenV7`, but the blacklist is stored in a mapping: checking if an account is blacklisted
 * reads a single value, so the gas cost does not depend on the size of the blacklist.
 * A mapping cannot be iterated and has no length: the `Blacklisted` event
 * is used to build the list off-chain.
 */
contract WrappedTokenV8 is ERC20, Ownable, ReentrancyGuard {
  /**
   * `isBlacklisted` maps each account to true if it is blacklisted
   * Every key exists: accounts that were never added return the default value, false
   * `public` creates a getter: `isBlacklisted(account)`
   */
  mapping(address => bool) public isBlacklisted;

  /**
   * Events are stored in the transaction logs. Off-chain apps can read them to build the blacklist
   * without calling the contract
   */
  event Blacklisted(address indexed account);

  /**
   * `owner_` is the address allowed to call `emergencyWithdraw` and to manage the blacklist
   * `Ownable` stores it and exposes it through `owner()`
   */
  constructor(string memory name_, string memory symbol_, address owner_) ERC20(name_, symbol_) Ownable(owner_) {
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
    require(balanceOf(msg.sender) > 0, "Insufficient balance");
    uint256 amount = balanceOf(msg.sender);

    _burn(msg.sender, balanceOf(msg.sender));

    (bool success, ) = msg.sender.call{value: amount}("");
    require(success, "ETH transfer failed");
  }

  /**
   * Withdraws all ETH from the contract.
   * It is intended to be used in case there is a bug in the contract and the contract needs to be drained.
   * `onlyOwner` reverts if `msg.sender` is not the owner
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

  /**
   * @dev Adds `account` to the blacklist.
   */
  function addToBlacklist(address account) external onlyOwner {
    require(!isBlacklisted[account], "Account is already blacklisted");
    isBlacklisted[account] = true;
    emit Blacklisted(account);
  }

  /**
   * @dev `ERC20` calls `_update` on every mint, burn and transfer.
   * `override` replaces the `ERC20` version, and `super._update` calls it after the checks
   * Mints have `from = address(0)` and burns have `to = address(0)`
   */
  function _update(address from, address to, uint256 value) internal override {
    require(!isBlacklisted[from], "Sender is blacklisted");
    require(!isBlacklisted[to], "Recipient is blacklisted");
    super._update(from, to, value);
  }
}
