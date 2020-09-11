// SPDX-License-Identifier: MIT
pragma solidity 0.7.0;

import '../../../price-feed/contracts/IPriceFeed.sol';

contract PriceFeedMock is IPriceFeed {

    uint private price = 1;
    function update() public override returns(uint, uint32) {}

    function consult() external override view returns (uint) {
        return price;
    }

    function updateAndConsult() external override view returns (uint) {
        return price;
    }

    function setPrice(uint _price) public returns(uint) {
        price = _price;
    }
}
