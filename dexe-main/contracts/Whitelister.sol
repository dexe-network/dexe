// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import '@openzeppelin/contracts/access/Ownable.sol';

import './Dexe.sol';

contract Whitelister is Ownable {
    function addToWhitelist(Dexe _dexe, address[] calldata _address, uint[] calldata _limit) external onlyOwner() {
        uint _len = _address.length;
        for (uint i = 0; i < _len; i++) {
            _dexe.addToWhitelist(_address[i], _limit[i]);
        }
    }

    function transferDexeOwnership(Dexe _dexe, address _to) external onlyOwner() {
        _dexe.transferOwnership(_to);
    }
}
