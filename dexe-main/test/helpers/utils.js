// web3 is inited in truffle
const Promise = require('bluebird');
const updatedDiff = require('deep-object-diff').updatedDiff;
const inspect = require('util').inspect;
const bn = (input) => web3.utils.toBN(input);
const assertBNequal = (bnOne, bnTwo, message) => assert.equal(bnOne.toString(), bnTwo.toString(), message);
const getTransactionTimestamp = async (tx) => (await web3.eth.getBlock(tx.receipt.blockNumber)).timestamp;

const tokenAsserts = (dexe, accounts) => {
  const assertBalance = async (user, balance) => {
    assertBNequal(await dexe.balanceOf(user), balance, `${user} balance mismatch`);
  };
  const assertHolderRound = async (roundId, user, deposited, endBalance, status) => {
    const round = await dexe.holderRounds(roundId, user);
    assertBNequal(round.deposited, deposited, `${user} round ${roundId} deposited mismatch`);
    assertBNequal(round.endBalance, endBalance, `${user} round ${roundId} endBalance mismatch`);
    assertBNequal(round.status, status, `${user} round ${roundId} status mismatch`);
  };
  const assertUserInfo = async (user, firstRoundDeposited, balanceBeforeLaunch) => {
    const info = await dexe.usersInfo(user);
    assertBNequal(info.firstRoundDeposited, firstRoundDeposited, `${user} info firstRoundDeposited mismatch`);
    assertBNequal(info.balanceBeforeLaunch, balanceBeforeLaunch, `${user} info balanceBeforeLaunch mismatch`);
  };

  const users = [
    'owner',
    'userOne',
    'userTwo',
    'userThree',
    'tokensale',
  ];

  const getState = async (holders = 4) => {
    const state = {
      rounds: {},
      holders: {},
      averagePrice: 0,
      launchedAfter: 0,
    };
    const holderList = Array.from({length: holders}).map((_, index) => index);
    const rounds = await dexe.getAllRounds();
    const holdersInfo = await Promise.map(holderList, (index) => dexe.getFullHolderInfo(accounts[index]));
    const tokensaleInfo = await dexe.getFullHolderInfo(dexe.address);
    holdersInfo.push(tokensaleInfo);
    for (let i = 1; i <= 22; i++) {
      const round = rounds[i-1];
      const holderRounds = {};
      for (let j = 0; j < holdersInfo.length; j++) {
        const holder = holdersInfo[j]._rounds[i-1];
        holderRounds[users[j]] = {
          deposited: holder.deposited.toString(10),
          endBalance: holder.endBalance.toString(10),
          status: HolderRoundStatus[holder.status.toString(10)],
        };
      }
      state.rounds[i] = {
        totalDeposited: round.totalDeposited.toString(10),
        roundPrice: round.roundPrice.toString(10),
        holderRounds,
      };
    }
    for (let j = 0; j < holdersInfo.length; j++) {
      const holderInfo = holdersInfo[j]._info;
      const balance = holdersInfo[j]._balance;
      const stake = holdersInfo[j]._locks[LockType.Staking];
      state.holders[users[j]] = {
        firstRoundDeposited: holderInfo.firstRoundDeposited.toString(10),
        balanceBeforeLaunch: holderInfo.balanceBeforeLaunch.toString(10),
        balance: balance.toString(10),
        stake: {
          balance: stake.balance.toString(10),
          released: stake.released.toString(10),
        },
        locks: {
          foundation: {
            balance: holdersInfo[j]._locks[LockType.Foundation].balance.toString(10),
            released: holdersInfo[j]._locks[LockType.Foundation].released.toString(10),
          },
          team: {
            balance: holdersInfo[j]._locks[LockType.Team].balance.toString(10),
            released: holdersInfo[j]._locks[LockType.Team].released.toString(10),
          },
          partnership: {
            balance: holdersInfo[j]._locks[LockType.Partnership].balance.toString(10),
            released: holdersInfo[j]._locks[LockType.Partnership].released.toString(10),
          },
          school: {
            balance: holdersInfo[j]._locks[LockType.School].balance.toString(10),
            released: holdersInfo[j]._locks[LockType.School].released.toString(10),
          },
          marketing: {
            balance: holdersInfo[j]._locks[LockType.Marketing].balance.toString(10),
            released: holdersInfo[j]._locks[LockType.Marketing].released.toString(10),
          },
        },
      };
    }
    state.averagePrice = (await dexe.averagePrice()).toString(10);
    state.launchedAfter = (await dexe.launchedAfter()).toString(10);
    return state;
  };

  const reconstruct = (obj, keys, result = {}) => {
    for (const key in keys) {
      if (typeof keys[key] === 'object') {
        result[key] = reconstruct(obj[key], keys[key]);
      } else {
        result[key] = `${obj[key]} -> ${keys[key]}`;
      }
    }
    return result;
  };

  const changes = (from, to) => {
    const update = updatedDiff(from, to);
    return [update, reconstruct(from, update)];
  };

  const transit = (obj, transition) => {
    for (const key in transition) {
      if (typeof transition[key] === 'object') {
        transit(obj[key], transition[key]);
      } else {
        obj[key] = transition[key];
      }
    }
  };

  const assertState = async (expectedState, stateTransitions, index, operation) => {
    const actual = await getState();
    if (!expectedState) {
      expectedState = JSON.parse(JSON.stringify(actual));
      console.info(inspect(expectedState, {depth: 5}));
    }
    // If we don't have expected state, generate it along with transitions.
    if (index >= stateTransitions.length) {
      const [update, comment] = changes(expectedState, actual);
      console.info('/*');
      console.info(operation);
      console.info(inspect(comment, {depth: 5}));
      console.info('*/');
      console.info(inspect(update, {depth: 5, breakLength: Infinity, compact: 10}) + ',');
      stateTransitions.push(update);
    }
    transit(expectedState, stateTransitions[index]);
    assert.deepEqual(actual, expectedState, `State ${index} mismatch after ${operation}.`);
    return expectedState;
  };

  const stateChecker = async (stateFile) => {
    let index = 0;
    let {expectedState, stateTransitions} = require(`../states/${stateFile}`);
    expectedState = await assertState(expectedState, stateTransitions, index++, 'start');
    const check = async (operation, tx) => {
      await tx;
      expectedState = await assertState(expectedState, stateTransitions, index++, operation);
    };
    const doTransfer = (from, to, value) => {
      return check(
        `${users[from]} transfer ${value.toString(10)} to ${users[to]}.`,
        dexe.transfer(accounts[to], value, {from: accounts[from]}),
      );
    };

    const doTransferLock = (from, lockType, to, value) => {
      return check(
        `${users[from]} transfer ${value.toString(10)} ${LockType[lockType]} lock to ${users[to]}.`,
        dexe.transferLock(lockType, accounts[to], value, {from: accounts[from]}),
      );
    };

    const doReceiveAll = (from) => {
      return check(
        `${users[from]} receive all.`,
        dexe.receiveAll({from: accounts[from]}),
      );
    };

    const doPrepareDistribution = (round, from = 0) => {
      return check(
        `${users[from]} prepare distribution for round ${round}`,
        dexe.prepareDistribution(round, {from: accounts[from]}),
      );
    };

    const doPrepareDistributions = async (startFromRound = 1, endRound = 22) => {
      for (let i = startFromRound; i <= endRound; i++) {
        await doPrepareDistribution(i);
      }
    };

    const doLaunch = (from) => {
      return check(
        `${users[from]} lanunch product.`,
        dexe.launchProduct({from: accounts[from]}),
      );
    };

    const doDepositUSDC = (from, value) => {
      return check(
        `${users[from]} deposit ${value.toString(10)} USDC.`,
        dexe.depositUSDC(value, {from: accounts[from]}),
      );
    };

    const doRelease = (from, lockType) => {
      return check(
        `${users[from]} release ${LockType[lockType]}.`,
        dexe.releaseLock(lockType, {from: accounts[from]}),
      );
    };

    const doForceRelease = (from, forceReleaseType) => {
      return check(
        `${users[from]} forceRelease ${ForceReleaseType[forceReleaseType]}.`,
        dexe.forceReleaseStaking(forceReleaseType, {from: accounts[from]}),
      );
    };
    return {doTransfer, doPrepareDistribution, doPrepareDistributions, doLaunch, check,
      doDepositUSDC, doReceiveAll, doTransferLock, doRelease, doForceRelease};
  };
  return {
    assertBalance,
    assertHolderRound,
    assertUserInfo,
    stateChecker,
  };
};

const HolderRoundStatus = {
  NONE: 0,
  RECEIVED: 1,
  0: 'NONE',
  1: 'RECEIVED',
};

const LockType = {
  Staking: 0,
  Foundation: 1,
  Team: 2,
  Partnership: 3,
  School: 4,
  Marketing: 5,
  0: 'Staking',
  1: 'Foundation',
  2: 'Team',
  3: 'Partnership',
  4: 'School',
  5: 'Marketing',
};

const ForceReleaseType = {
  X7: 0,
  X10: 1,
  X15: 2,
  X20: 3,
  0: 'X7',
  1: 'X10',
  2: 'X15',
  3: 'X20',
};

const prepareDistributions = async (dexe, startFrom = 3) => {
  for (let i = startFrom; i <= 22; i++) {
    await dexe.prepareDistribution(i);
  }
};

module.exports = {
  bn,
  assertBNequal,
  tokenAsserts,
  getTransactionTimestamp,
  HolderRoundStatus,
  prepareDistributions,
  LockType,
  ForceReleaseType,
};
