// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

contract TransfersWrapper {
    IERC20 token;

    constructor (address _tokenAddress) {
        token = IERC20(_tokenAddress);
    }

    function performFewTransfers(uint _amount1, uint _amount2, uint _amount3) external {
        token.transferFrom(msg.sender, address(this), _amount1);
        token.transfer(msg.sender, _amount1);

        token.transferFrom(msg.sender, address(this), _amount2);
        token.transfer(msg.sender, _amount2);

        token.transferFrom(msg.sender, address(this), _amount3);
        token.transfer(msg.sender, _amount3);
    }
}