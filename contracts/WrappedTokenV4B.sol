// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev This contract is used for educational purposes only. It is not intended for production use.
 * Do not use this contract in production environments.
 *
 * Same as `WrappedTokenV3`, but `withdraw` and `emergencyWithdraw` are protected with a lock.
 * Unlike `WrappedTokenV4A`, `withdraw` keeps the vulnerable order of `WrappedTokenV3`: the lock stops re-entering `withdraw`,
 * but not re-entering other functions, such as `transfer`.
 */
contract WrappedTokenV4B is ERC20 {
  address public owner;

  /**
   * `locked` is true while a protected function is running
   */
  bool private locked;

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
   * 1. If `locked` is true, a protected function is already running, so it reverts
   * 2. `locked` is set to true before calling `msg.sender`. If `msg.sender` re-enters, step 1 reverts
   * 3. `locked` is set back to false at the end. Otherwise, nobody could call it again
   * Only functions that check `locked` are protected: `msg.sender` can still call `transfer` before its tokens are burned
   */
  function withdraw() external {
    require(!locked, "Reentrant call");
    locked = true;

    require(balanceOf(msg.sender) > 0, "Insufficient balance");

    (bool success, ) = msg.sender.call{value: balanceOf(msg.sender)}("");
    require(success, "ETH transfer failed");

    _burn(msg.sender, balanceOf(msg.sender));

    locked = false;
  }

  /**
   * Withdraws all ETH from the contract. Only the owner can call it.
   * It is intended to be used in case there is a bug in the contract and the contract needs to be drained.
   * The lock is the same code as in `withdraw`, repeated. It shares the `locked` variable, so it also
   * reverts if it is called while `withdraw` is running
   * `msg.sender` is the immediate caller: if the owner calls a malicious contract, the malicious contract is `msg.sender` here
   * `recipient` is the address that will receive the ETH
   * `address(this).balance` is the current ETH balance of the contract
   * `call` is used to transfer ETH from the contract balance
   */
  function emergencyWithdraw(address recipient) external {
    require(!locked, "Reentrant call");
    locked = true;

    require(msg.sender == owner, "Caller is not the owner");

    uint256 contractBalance = address(this).balance;
    require(contractBalance > 0, "No ETH to withdraw");

    (bool success, ) = recipient.call{value: contractBalance}("");
    require(success, "ETH transfer failed");

    locked = false;
  }
}
