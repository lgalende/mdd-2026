// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20 {
  constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
  }

  function create(address to, uint256 amount) external {
    if (balanceOf(to) > 0) {
      revert("Recipient already has tokens");
    }
    _mint(to, amount);
  }
}
