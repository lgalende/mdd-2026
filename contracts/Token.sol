// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20 {
  constructor(
    string memory name_,
    string memory symbol_,
    uint256 initialSupply,
    address initialOwner
  ) ERC20(name_, symbol_) {
    if (initialSupply > 0) {
      _mint(initialOwner, initialSupply);
    }
  }
}
