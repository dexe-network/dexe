// SPDX-License-Identifier: MIT
pragma solidity 0.7.0;
pragma experimental ABIEncoderV2;

import './Dexe.sol';

interface IDeployPriceFeeds {
    function deploy() external returns(IPriceFeed, IPriceFeed);
}

contract DeployDexe {
    address constant MANAGER = 0x3F2B55627fC7d8254890f5E131D3f5CA8A9eeB6f;
    address constant DISTRIBUTOR = 0x49497a98451f64c875ACa3b6f48dB37943850009;
    IERC20 constant USDC = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    IERC20 constant USDT = IERC20(0xdAC17F958D2ee523a2206206994597C13D831ec7);
 
    constructor(IDeployPriceFeeds _deployPriceFeeds) {
        // Deploy Dexe specifying the Distributor, deployed address should be starting with 0xde4e, or atleast 0xb.
        Dexe _dexe = new Dexe(DISTRIBUTOR);
        require(uint(address(USDC)) < uint(address(_dexe)), 'Invalid DEXE address');
        // Update Treasury, optional.
        // Set USDC address in Dexe.
        _dexe.setUSDCTokenAddress(USDC);
        // Set USDT address in Dexe.
        _dexe.setUSDTTokenAddress(USDT);
        // Deploy PriceFeed for USDT.
        // Deploy PriceFeed for ETH.
        IPriceFeed _priceFeedUSDT;
        IPriceFeed _priceFeedETH;
        (_priceFeedUSDT, _priceFeedETH) = _deployPriceFeeds.deploy();
        // Set USDT PriceFeed in Dexe.
        _dexe.setUSDTFeed(_priceFeedUSDT);
        // Set ETH PriceFeed in Dexe.
        _dexe.setETHFeed(_priceFeedETH);
        // Set DEXE PriceFeed in Dexe.
        _dexe.transferOwnership(MANAGER);
        // In the next tx:
        //   Update USDT price feed.
        //   Update ETH price feed.
    }
}
