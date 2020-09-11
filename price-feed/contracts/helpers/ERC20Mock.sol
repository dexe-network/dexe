// SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import '../PriceFeed.sol';

contract ERC20Mock {
    uint public decimals;

    function setDecimals(uint _decimals) external {
        decimals = _decimals;
    }
}
