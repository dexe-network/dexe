// SPDX-License-Identifier: MIT
pragma solidity 0.7.0;
pragma experimental ABIEncoderV2;

import '../Dexe.sol';
import '../helpers/PriceFeedMock.sol';
import '../helpers/TokenMock.sol';

contract Fuzz_Dexe is Dexe {
    uint public constant DEXE = 10**18;
    address public immutable originalOwner = msg.sender;

    constructor() Dexe(msg.sender) {
        usdtToken = IERC20(address(new TokenMock()));
        usdcToken =  IERC20(address(new TokenMock()));
        usdtPriceFeed = IPriceFeed(address(new PriceFeedMock()));
        dexePriceFeed = IPriceFeed(address(new PriceFeedMock()));
        ethPriceFeed = IPriceFeed(address(new PriceFeedMock()));
    }

    function help_echidna_setPriceUSDT(uint _price) external {
        PriceFeedMock(address(usdtPriceFeed)).setPrice(_price);
    }

    function help_echidna_setPriceETH(uint _price) external {
        PriceFeedMock(address(ethPriceFeed)).setPrice(_price);
    }

    function help_echidna_setPriceDEXE(uint _price) external {
        PriceFeedMock(address(dexePriceFeed)).setPrice(_price);
    }

    function help_echidna_setUSDTSuccess(bool _success) external {
        TokenMock(address(usdtToken)).setSuccess(_success);
    }

    function help_echidna_setUSDCSuccess(bool _success) external {
        TokenMock(address(usdcToken)).setSuccess(_success);
    }

    function echidna_totalSupply() public view returns (bool) {
        return(totalSupply() <= 100_000_000 * DEXE);
    }

    function echidna_treasury() public view returns (bool) {
        return(treasury != address(0));
    }

    function echidna_current_round() public view returns (bool) {
        return(currentRound() >= 1 && currentRound() <= 23);
    }

    function echidna_deposit_round() public view returns (bool) {
        return(depositRound() >= 1 && depositRound() <= 22);
    }

    function echidna_deposit_round_not_ended() public view returns (bool) {
        return !isRoundDepositsEnded(depositRound());
    }

    function echidna_locks_overflow() public view returns (bool) {
        Lock memory lock1 = locks[LockType.Staking][originalOwner];
        Lock memory lock2 = locks[LockType.Foundation][originalOwner];
        Lock memory lock3 = locks[LockType.Team][originalOwner];
        Lock memory lock4 = locks[LockType.Partnership][originalOwner];
        Lock memory lock5 = locks[LockType.School][originalOwner];
        Lock memory lock6 = locks[LockType.Marketing][originalOwner];
        return(
            lock1.balance <= lock1.released &&
            lock2.balance <= lock2.released &&
            lock3.balance <= lock3.released &&
            lock4.balance <= lock4.released &&
            lock5.balance <= lock5.released &&
            lock6.balance <= lock6.released
        );
    }

    function echidna_owner_rounds() public view returns (bool) {
        HolderRound memory round0 = _holderRounds[0][originalOwner];
        HolderRound memory round23 = _holderRounds[23][originalOwner];
        return(
            round0.deposited == 0 &&
            round0.endBalance == 0 &&
            round0.status == HolderRoundStatus.None &&
            round23.deposited == 0 &&
            round23.endBalance == 0 &&
            round23.status == HolderRoundStatus.None
        );
    }

    function echidna_tokensale_rounds() public view returns (bool) {
        HolderRound memory round0 = _holderRounds[0][address(this)];
        HolderRound memory round1 = _holderRounds[1][address(this)];
        HolderRound memory round2 = _holderRounds[2][address(this)];
        HolderRound memory round22 = _holderRounds[22][address(this)];
        return(
            round0.deposited == 0 &&
            round0.endBalance == 0 &&
            round0.status == HolderRoundStatus.None &&
            round1.deposited == 0 &&
            round1.endBalance == 0 &&
            round1.status == HolderRoundStatus.None &&
            round2.deposited == 0 &&
            round2.endBalance == 0 &&
            round2.status == HolderRoundStatus.None &&
            round22.deposited == 0 &&
            round22.endBalance == 0 &&
            round22.status == HolderRoundStatus.None
        );
    }

    function echidna_tokensale_user_info() public view returns (bool) {
        UserInfo memory info = _usersInfo[address(this)];
        return(
            info.balanceBeforeLaunch == 0 &&
            info.firstRoundDeposited == 0
        );
    }

    function echidna_tokensale_owner_info() public view returns (bool) {
        UserInfo memory info = _usersInfo[originalOwner];
        return(
            info.firstRoundDeposited == 1 &&
            info.balanceBeforeLaunch <= (100_000_000 * DEXE)
        );
    }
}
