// SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

contract PairMock {
    address public constant USDCAddress = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    uint priceCumulativeLast;
    address public token1;

    uint reserve0;
    uint reserve1;
    uint blockTimestampLast;

    function price1CumulativeLast() external view returns(uint) {
        return priceCumulativeLast;
    }

    function price0CumulativeLast() external pure returns(uint) {
        return 0;
    }

    function token0() external pure returns(address) {
        return USDCAddress;
    }

    function getReserves() external view returns(uint, uint, uint) {
        return(reserve0, reserve1, blockTimestampLast);
    }

    function setReserves(uint _reserve0, uint _reserve1) external {
        reserve0 = _reserve0;
        reserve1 = _reserve1;
    }

    function setBlockTimestampLast(uint _time) external {
        blockTimestampLast = _time;
    }

    function setToken1(address _token) external {
        token1 = _token;
    }

    function setPriceCumulativeLast(uint _price) external {
        priceCumulativeLast = _price;
    }
}
