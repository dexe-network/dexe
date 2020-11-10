// SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import './IPriceFeed.sol';

contract USDC_USDTPriceFeed is IPriceFeed {
    function update() public override returns(uint) {
        return 1000000;
    }

    function consult() external override view returns (uint) {
        return 1000000;
    }

    function updateAndConsult() external override returns (uint) {
        return update();
    }
}
