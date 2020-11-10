// SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import './IPriceFeed.sol';

interface IDexe {
    function rounds(uint) external view returns(uint120, uint128);
}

contract DEXERoundOnePriceFeed is IPriceFeed {
    function update() public override returns(uint) {
        return consult();
    }

    function consult() public override view returns (uint) {
        IDexe _dexe = IDexe(0xde4EE8057785A7e8e800Db58F9784845A5C2Cbd6);
        uint _deposited;
        (_deposited, ) = _dexe.rounds(1);
        return _deposited / uint(1000000);
    }

    function updateAndConsult() public override returns (uint) {
        return update();
    }
}
