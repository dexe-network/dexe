// SPDX-License-Identifier: MIT
pragma solidity 0.6.6;
pragma experimental ABIEncoderV2;

import './PriceFeed.sol';

contract DeployPriceFeeds {
    IUniswapV2Pair constant USDC_USDT_PAIR = IUniswapV2Pair(0x3041CbD36888bECc7bbCBc0045E3B1f144466f5f);
    IUniswapV2Pair constant USDC_ETH_PAIR = IUniswapV2Pair(0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc);

    function deploy() public returns(address, address) {
        PriceFeed _priceFeedUSDT = new PriceFeed(USDC_USDT_PAIR);
        PriceFeed _priceFeedETH = new PriceFeed(USDC_ETH_PAIR);
        return (address(_priceFeedUSDT), address(_priceFeedETH));
    }
}
