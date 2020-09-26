// SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import '@uniswap/lib/contracts/libraries/FixedPoint.sol';
import '@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol';

import './IPriceFeed.sol';

interface IERC20 {
    function decimals() external view returns(uint8);
}

// at least 1 block USDC price feed.
contract PriceFeed is IPriceFeed {
    using FixedPoint for *;

    address constant USDCAddress = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    IUniswapV2Pair public immutable pair;
    uint public immutable multiplier;

    uint private priceLast;
    uint public priceCumulativeLast;
    uint32 public blockTimestampLast;

    constructor(IUniswapV2Pair _pair) public override {
        pair = _pair;
        require(_pair.token0() == USDCAddress, 'Invalid pair');

        multiplier = uint(10)**(IERC20(_pair.token1()).decimals());
        priceCumulativeLast = _pair.price1CumulativeLast();
        uint112 reserve0;
        uint112 reserve1;
        (reserve0, reserve1, blockTimestampLast) = _pair.getReserves();
        // ensure that there's liquidity in the pair
        require(reserve0 != 0 && reserve1 != 0, 'ExampleOracleSimple: NO_RESERVES');
    }

    function update() public override returns(uint) {
        (, uint _priceCumulative, uint32 _blockTimestamp) =
            UniswapV2OracleLibrary.currentCumulativePrices(address(pair));
        uint _priceCumulativeLast = priceCumulativeLast;
        uint _blockTimestampLast = blockTimestampLast;
        uint _price;

        if (_blockTimestamp != _blockTimestampLast) {
            _price = FixedPoint.uq112x112(uint224((_priceCumulative - _priceCumulativeLast) /
                (_blockTimestamp - _blockTimestampLast))).mul(multiplier).decode144();
            priceLast = _price;
            priceCumulativeLast = _priceCumulative;
            blockTimestampLast = _blockTimestamp;
        } else {
            _price = priceLast;
        }

        return _price;
    }

    // note this will always return 0 before update has been called successfully for the first time.
    function consult() external override view returns (uint) {
        (, uint _priceCumulative, uint32 _blockTimestamp) =
            UniswapV2OracleLibrary.currentCumulativePrices(address(pair));
        uint _priceCumulativeLast = priceCumulativeLast;
        uint _blockTimestampLast = blockTimestampLast;

        // Most recent price is already calculated.
        if (_blockTimestamp == _blockTimestampLast) {
            return priceLast;
        }

        return FixedPoint.uq112x112(uint224((_priceCumulative - _priceCumulativeLast) / 
            (_blockTimestamp - _blockTimestampLast))).mul(multiplier).decode144();
    }

    function updateAndConsult() external override returns (uint) {
        return update();
    }
}
