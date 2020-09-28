// SPDX-License-Identifier: MIT
pragma solidity 0.7.0;
pragma experimental ABIEncoderV2;

import './Dexe.sol';

contract DexeUI {
    using ExtraMath for *;
    using SafeMath for *;

    uint private constant DEXE = 10**18;
    uint private constant ROUND_SIZE_BASE = 190_476;
    uint private constant ROUND_SIZE = ROUND_SIZE_BASE * DEXE;
    uint private constant FIRST_ROUND_SIZE_BASE = 1_000_000;
    uint private constant PERCENT = 10_000;
    Dexe public immutable dexe;
    uint private constant TOTAL_ROUNDS = 22;

    constructor(Dexe _dexe) {
        dexe = _dexe;
    }

    function _getRound(uint _round) private view returns (Dexe.Round memory) {
        uint totalDeposited;
        uint roundPrice;
        (totalDeposited, roundPrice) = dexe.rounds(_round);
        return Dexe.Round(uint120(totalDeposited), uint128(roundPrice));
    }

    function predictedRoundResults(uint _round) public view returns(uint, uint) {
        Dexe.Round memory _localRound = _getRound(_round);
        if (_localRound.roundPrice > 0) {
            return (_localRound.roundPrice, _localRound.totalDeposited.divCeil(_localRound.roundPrice) * DEXE);
        }

        if (_round == 1) {
            _localRound.roundPrice = _localRound.totalDeposited.divCeil(FIRST_ROUND_SIZE_BASE).toUInt128();

            // If nobody deposited.
            if (_localRound.roundPrice == 0) {
                _localRound.roundPrice = 1;
            }
            return (_localRound.roundPrice, FIRST_ROUND_SIZE_BASE * DEXE);
        }

        uint _localRoundPrice = dexe.dexePriceFeed().consult();
        uint _totalTokensSold = _localRound.totalDeposited.mul(DEXE) / _localRoundPrice;

        if (_totalTokensSold < ROUND_SIZE) {
            // Apply 0-10% discount based on how much tokens left. Empty round applies 10% discount.
            _localRound.roundPrice =
                (uint(9).mul(ROUND_SIZE_BASE).mul(_localRoundPrice).add(_localRound.totalDeposited)).divCeil(
                uint(10).mul(ROUND_SIZE_BASE)).toUInt128();
            uint _discountedTokensSold = _localRound.totalDeposited.mul(DEXE) / _localRound.roundPrice;

            return (_localRound.roundPrice, _discountedTokensSold);
        }

        return (_localRound.totalDeposited.divCeil(ROUND_SIZE_BASE), ROUND_SIZE);
    }

    function holderClaimableBalance(address _holder) public view returns(uint, uint, uint) {
        IDexe.HolderRound[22] memory _holderRounds;
        IDexe.UserInfo memory _userInfo;
        (_userInfo, _holderRounds,,,,) = dexe.getFullHolderInfo(_holder);
        Dexe.Round[22] memory _rounds = dexe.getAllRounds();
        // Holder received everything.
        if (_holderRounds[TOTAL_ROUNDS - 1].status == IDexe.HolderRoundStatus.Received) {
            return (0, 0, 0);
        }

        // Holder didn't participate in the sale.
        if (_userInfo.firstRoundDeposited == 0) {
            return (0, 0, 0);
        }

        if (_notPassed(dexe.tokensaleStartDate())) {
            return (0, 0, 0);
        }

        uint _currentRound = dexe.currentRound();

        uint _totalDexe = 0;
        uint _totalReward = 0;
        uint _percent = 0;
        for (uint i = (_userInfo.firstRoundDeposited - 1); i < (_currentRound - 1); i++) {
            // Skip received rounds.
            if (_holderRounds[i].status == IDexe.HolderRoundStatus.Received) {
                continue;
            }

            Dexe.Round memory _localRound = _rounds[i];

            _totalDexe += _receiveDistribution(i, _holderRounds, _localRound);
            uint _rewards;
            (_rewards, ) = _receiveRewards(i, _holderRounds, _localRound);
            _totalReward += _rewards;
        }
        _rounds[_currentRound - 1].roundPrice = dexe.dexePriceFeed().consult().toUInt128();
        (, _percent) = _receiveRewards(_currentRound - 1, _holderRounds, _rounds[_currentRound - 1]);

        return (_totalDexe, _totalReward, _percent);
    }

    // Receive tokens based on the deposit.
    function _receiveDistribution(uint _round, Dexe.HolderRound[22] memory _holderRounds, Dexe.Round memory _localRound)
    private pure returns(uint) {
        uint _balance = _holderRounds[_round].deposited.mul(DEXE) / _localRound.roundPrice;

        uint _endBalance = _holderRounds[_round].endBalance.add(_balance);
        _holderRounds[_round].endBalance = _endBalance.toUInt128();
        if (_round < TOTAL_ROUNDS - 1) {
            _holderRounds[_round.add(1)].endBalance =
                _holderRounds[_round.add(1)].endBalance.add(_endBalance).toUInt128();
        }
        return _balance;
    }

    // Receive rewards based on the last round balance, participation in 1st round and this round fill.
    function _receiveRewards(uint _round, Dexe.HolderRound[22] memory _holderRounds, Dexe.Round memory _localRound)
    private pure returns(uint, uint) {
        if (_round > 21 - 1) {
            return (0, 0);
        }
        uint _reward;
        uint _percent;
        if (_round == 0) {
            // First round is always 5%.
            _reward = (_holderRounds[_round].endBalance).mul(5) / 100;
            _percent = 5 * PERCENT;
        } else {
            uint _x2 = 1;
            uint _previousRoundBalance = _holderRounds[_round.sub(1)].endBalance;

            // Double reward if increased balance since last round by 1%+.
            if (_previousRoundBalance > 0 &&
                (_previousRoundBalance.mul(101) / 100) < _holderRounds[_round].endBalance)
            {
                _x2 = 2;
            }

            uint _roundPrice = _localRound.roundPrice;
            uint _totalDeposited = _localRound.totalDeposited;
            uint _holderBalance = _holderRounds[_round].endBalance;
            uint _minPercent = 2;
            uint _maxBonusPercent = 6;
            if (_holderRounds[0].endBalance > 0) {
                _minPercent = 5;
                _maxBonusPercent = 15;
            }
            // Apply reward modifiers in the following way:
            // 1. If participated in round 1, then the base is 5%, otherwise 2%.
            // 2. Depending on the round fill 0-100% get extra 15-0% (round 1 participants) or 6-0%.
            // 3. Double reward if increased balance since last round by 1%+.
            _reward = _minPercent.add(_maxBonusPercent).mul(_roundPrice).mul(ROUND_SIZE_BASE)
                .sub(_maxBonusPercent.mul(_totalDeposited)).mul(_holderBalance).mul(_x2) /
                100.mul(_roundPrice).mul(ROUND_SIZE_BASE);
            _percent = _reward * 100 * PERCENT / _holderBalance;
        }

        return (_reward, _percent);
    }

    function _passed(uint _time) private view returns(bool) {
        return block.timestamp > _time;
    }

    function _notPassed(uint _time) private view returns(bool) {
        return _not(_passed(_time));
    }

    function _not(bool _condition) private pure returns(bool) {
        return !_condition;
    }

    // Get released tokens to the main balance.
    function holderCanRelease(address _holder) public view returns(uint) {
        return _release(Dexe.LockType.Staking, _holder) +
            _release(Dexe.LockType.Foundation, _holder) +
            _release(Dexe.LockType.Team, _holder) +
            _release(Dexe.LockType.Partnership, _holder) +
            _release(Dexe.LockType.School, _holder) +
            _release(Dexe.LockType.Marketing, _holder);
    }

    function _getLockConfig(Dexe.LockType _lockType) private view returns(Dexe.LockConfig memory) {
        uint releaseStart;
        uint vesting;
        (releaseStart, vesting) = dexe.lockConfigs(_lockType);
        return Dexe.LockConfig(uint32(releaseStart), uint32(vesting));
    }

    function _getLock(Dexe.LockType _lockType, address _holder) private view returns(Dexe.Lock memory) {
        uint balance;
        uint released;
        (balance, released) = dexe.locks(_lockType, _holder);
        return Dexe.Lock(uint128(balance), uint128(released));
    }

    function _release(Dexe.LockType _lockType, address _holder) private view returns(uint) {
        Dexe.LockConfig memory _lockConfig = _getLockConfig(_lockType);
        if (_notPassed(_lockConfig.releaseStart)) {
            return 0;
        }

        Dexe.Lock memory _lock = _getLock(_lockType, _holder);
        uint _balance = _lock.balance;
        uint _released = _lock.released;

        uint _balanceToRelease =
            _balance.mul(_since(_lockConfig.releaseStart)) / _lockConfig.vesting;

        // If more than enough time already passed, release what is left.
        if (_balanceToRelease > _balance) {
            _balanceToRelease = _balance;
        }

        if (_balanceToRelease <= _released) {
            return 0;
        }

        // Underflow cannot happen here, SafeMath usage left for code style.
        return _balanceToRelease.sub(_released);
    }

    function forceReleaseable(address _holder) public view returns(uint, uint, uint, uint) {
        return (_forceReleaseable(Dexe.ForceReleaseType.X7, _holder),
            _forceReleaseable(Dexe.ForceReleaseType.X10, _holder),
            _forceReleaseable(Dexe.ForceReleaseType.X15, _holder),
            _forceReleaseable(Dexe.ForceReleaseType.X20, _holder));
    }

    function holderInfo(address _holder) public view returns(uint[8] memory) {
        uint[8] memory _info;
        (_info[0], _info[1], _info[2]) = holderClaimableBalance(_holder);
        _info[3] = holderCanRelease(_holder);
        (_info[4], _info[5], _info[6], _info[7]) = forceReleaseable(_holder);
        return _info;
    }

    // Wrap call to updateAndGetCurrentPrice() function before froceReleaseStaking on UI to get
    // most up-to-date price.
    // In case price increased enough since average, allow holders to release Staking rewards with a fee.
    function _forceReleaseable(Dexe.ForceReleaseType _forceReleaseType, address _holder) private view returns(uint) {
        uint _currentRound = dexe.currentRound();
        if (_currentRound <= 10) {
            return 0;
        }

        uint _totalDexe = 0;
        uint _totalReward = 0;
        (_totalDexe, _totalReward, ) = holderClaimableBalance(_holder);
        Dexe.Lock memory _lock = _getLock(Dexe.LockType.Staking, _holder);
        if (_lock.balance == 0) {
            return 0;
        }

        uint _priceMul;
        uint _unlockedPart;
        uint _receivedPart;

        if (_forceReleaseType == Dexe.ForceReleaseType.X7) {
            _priceMul = 7;
            _unlockedPart = 10;
            _receivedPart = 86;
        } else if (_forceReleaseType == Dexe.ForceReleaseType.X10) {
            _priceMul = 10;
            _unlockedPart = 15;
            _receivedPart = 80;
        } else if (_forceReleaseType == Dexe.ForceReleaseType.X15) {
            _priceMul = 15;
            _unlockedPart = 20;
            _receivedPart = 70;
        } else {
            _priceMul = 20;
            _unlockedPart = 30;
            _receivedPart = 60;
        }

        if (dexe.forceReleased(_holder, _forceReleaseType)) {
            return 0;
        }

        if (dexe.dexePriceFeed().consult() < dexe.averagePrice().mul(_priceMul)) {
            return 0;
        }

        uint _balance = _lock.balance.sub(_lock.released);

        uint _released = _balance.mul(_unlockedPart) / 100;
        return _released.mul(_receivedPart) / 100;
    }

    function _since(uint _timestamp) private view returns(uint) {
        return block.timestamp.sub(_timestamp);
    }
}
