const Ganache = require('./helpers/ganache');
const {saleStartTime, saleEndTime} = require('./saleConfig');
const {bn, assertBNequal, prepareDistributions, LockType, ForceReleaseType} = require('./helpers/utils');

const Dexe = artifacts.require('Dexe');
const PriceFeedMock = artifacts.require('PriceFeedMock');
const TokenMock = artifacts.require('TokenMock');
const TransfersWrapper = artifacts.require('TransfersWrapper');

contract('Average Balance', function(accounts) {
  const ganache = new Ganache(web3);
  afterEach('revert', ganache.revert);

  const ROUND_DURATION_SEC = 86400;
  const DAY_IN_SEC = ROUND_DURATION_SEC;
  const FIRST_ROUND_SIZE = bn(1000000);
  const USDC_LIMIT_WHITELIST = bn('5000000000000000');
  const MONTH = DAY_IN_SEC * 30;

  const OWNER = accounts[0];
  const userOne = accounts[1];
  const userTwo = accounts[2];
  const userThree = accounts[3];

  const DEXE = bn(10).pow(bn(18));

  let dexe;
  let usdcToUsdtMock;
  let usdcToEthMock;
  let usdcToDexeMock;

  let tokenUSDCMock;
  let tokenUSDTMock;
  let transfersWrapper;

  before('setup others', async function() {
    dexe = await Dexe.new(accounts[0]);
    usdcToUsdtMock = await PriceFeedMock.new();
    usdcToEthMock = await PriceFeedMock.new();
    usdcToDexeMock = await PriceFeedMock.new();
    await dexe.setUSDTFeed(usdcToUsdtMock.address);
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.setETHFeed(usdcToEthMock.address);

    tokenUSDCMock = await TokenMock.new();
    tokenUSDTMock = await TokenMock.new();

    transfersWrapper = await TransfersWrapper.new(dexe.address);

    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await dexe.setUSDTTokenAddress(tokenUSDTMock.address);

    await dexe.addToWhitelist(OWNER, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(userOne, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(userTwo, USDC_LIMIT_WHITELIST);


    await ganache.snapshot();
  });

  describe('Before product launched', async () => {
    it('should calculate average balance for user that deposited in 1st round and did force release till sale ends', async function() {
      const depositAmountUSDCuserOne = bn(1000000);
      const depositAmountUSDCuserTwo = bn(3000000);

      const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).div(FIRST_ROUND_SIZE);

      await ganache.setTime(saleStartTime);

      await dexe.depositUSDC(depositAmountUSDCuserOne, {
        from: userOne,
      });
      await dexe.depositUSDC(depositAmountUSDCuserTwo, {
        from: userTwo,
      });
      // 1st round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
      await dexe.prepareDistribution(1);

      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 5);
      assert.equal(await dexe.balanceOf(userOne), 0);
      await dexe.receiveAll({from: userOne});

      const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);
      assertBNequal(await dexe.balanceOf(userOne), userOneDEXEBalance);

      const userOneStakingLockRoundOne = userOneDEXEBalance.mul(bn(5)).div(bn(100));
      const userOneStakingLock = await dexe.locks(LockType.Staking, userOne);

      assert.equal(userOneStakingLock.released, 0);
      // 2nd round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
      const uniswapPriceEndRoundTwo = 10;
      await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
      const secondRoundPrice = bn(uniswapPriceEndRoundTwo).sub((bn(uniswapPriceEndRoundTwo).mul(bn(10)).div(bn(100))));
      await dexe.prepareDistribution(2);
      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe);
      assert.equal(await dexe.isRoundDepositsEnded(22), true);

      const userOneStakingLockAllRounds = userOneDEXEBalance.mul(bn(20)).div(bn(100)).mul(bn(20));
      const userOneTenPercentStaking = userOneStakingLockRoundOne.add(userOneStakingLockAllRounds).mul(bn(10)).div(bn(100));

      const userOneX7Commission = userOneTenPercentStaking.mul(bn(14)).div(bn(100));

      await dexe.receiveAll({from: userOne});

      assertBNequal((await dexe.holderRounds(22, userOne)).endBalance, userOneDEXEBalance);
      await usdcToDexeMock.setPrice(secondRoundPrice.mul(bn(7)));

      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance,
      );

      await ganache.setTime(saleEndTime + 5);
      await dexe.forceReleaseStaking(ForceReleaseType.X7, {from: userOne});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.add(userOneTenPercentStaking).sub(userOneX7Commission),
      );

      const timeNow = saleEndTime + ROUND_DURATION_SEC * 3;
      await ganache.setTime(timeNow);

      const firstTimeReceiveTokens = saleStartTime + ROUND_DURATION_SEC + 5;
      const secondTimeReceiveTokens = saleEndTime + 5;

      const periodOne = bn(secondTimeReceiveTokens - firstTimeReceiveTokens);
      const periodTwo = bn(timeNow - secondTimeReceiveTokens);
      const periodTotal = periodOne.add(periodTwo);

      const balanceAfterFirstRound = userOneDEXEBalance;
      const balanceAfterSale = userOneDEXEBalance.add(userOneTenPercentStaking).sub(userOneX7Commission);

      const averagePriceExpected = ((balanceAfterFirstRound.mul(periodOne)).add(balanceAfterSale.mul(periodTwo))).div(periodTotal);

      assertBNequal(
        await dexe.getAverageBalance(userOne),
        averagePriceExpected,
      );
    });

    it('should calculate average balance for user that deposited in 1st round, sent tokens 1 time, get tokens 2 times', async function() {
      const depositAmountUSDCuserOne = bn(1000000);
      const depositAmountUSDCuserTwo = bn(3000000);

      const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).div(FIRST_ROUND_SIZE);

      await ganache.setTime(saleStartTime);

      await dexe.depositUSDC(depositAmountUSDCuserOne, {
        from: userOne,
      });
      await dexe.depositUSDC(depositAmountUSDCuserTwo, {
        from: userTwo,
      });
      // 1st round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
      await dexe.prepareDistribution(1);

      assert.equal(await dexe.balanceOf(userOne), 0);
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 5);
      await dexe.receiveAll({from: userOne});

      const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);
      assertBNequal(await dexe.balanceOf(userOne), userOneDEXEBalance);

      const userOneStakingLock = await dexe.locks(LockType.Staking, userOne);

      assert.equal(userOneStakingLock.released, 0);
      // 2nd round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
      const uniswapPriceEndRoundTwo = 10;
      await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
      await dexe.prepareDistribution(2);
      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe);

      await dexe.receiveAll({from: userOne});
      await dexe.receiveAll({from: userTwo});

      assertBNequal((await dexe.holderRounds(22, userOne)).endBalance, userOneDEXEBalance);

      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance,
      );

      await ganache.setTime(saleEndTime + 5);
      const transferToUserTwoAmount = bn(300000);
      await dexe.transfer(userTwo, transferToUserTwoAmount, {from: userOne});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.sub(transferToUserTwoAmount),
      );

      const firstTimeReceiveTokens = saleStartTime + ROUND_DURATION_SEC + 5;
      const firstTimeSendTokens = saleEndTime + 5;
      const secondTimeReceiveTokens = saleEndTime + ROUND_DURATION_SEC * 3;
      const thirdTimeReceiveTokens = saleEndTime + ROUND_DURATION_SEC * 13;
      const timeNow = saleEndTime + ROUND_DURATION_SEC * 16;

      await ganache.setTime(secondTimeReceiveTokens);

      const transferOneToUserOneAmount = bn(100000);
      await dexe.transfer(userOne, transferOneToUserOneAmount, {from: userTwo});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.sub(transferToUserTwoAmount).add(transferOneToUserOneAmount),
      );

      await ganache.setTime(thirdTimeReceiveTokens);

      const transferTwoToUserOneAmount = bn(50000);
      await dexe.transfer(userOne, transferTwoToUserOneAmount, {from: userTwo});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.sub(transferToUserTwoAmount).add(transferOneToUserOneAmount).add(transferTwoToUserOneAmount),
      );

      await ganache.setTime(timeNow);

      const periodOne = bn(firstTimeSendTokens - firstTimeReceiveTokens);
      const periodTwo = bn(secondTimeReceiveTokens - firstTimeSendTokens);
      const periodThree = bn(thirdTimeReceiveTokens - secondTimeReceiveTokens);
      const periodLast = bn(timeNow - thirdTimeReceiveTokens);
      const periodTotal = periodOne.add(periodTwo).add(periodThree).add(periodLast);

      const balanceAfterFirstRound = userOneDEXEBalance;
      const balanceAfterFirstTimeSendTokens = userOneDEXEBalance.sub(transferToUserTwoAmount);
      const balanceAfterSecondTimeReceiveTokens = balanceAfterFirstTimeSendTokens.add(transferOneToUserOneAmount);
      const balanceAfterPeriodLast = balanceAfterSecondTimeReceiveTokens.add(transferTwoToUserOneAmount);

      const averagePeriodOne = balanceAfterFirstRound.mul(periodOne);
      const averagePeriodTwo = balanceAfterFirstTimeSendTokens.mul(periodTwo);
      const averagePeriodThree = balanceAfterSecondTimeReceiveTokens.mul(periodThree);
      const averagePeriodLast = balanceAfterPeriodLast.mul(periodLast);

      const averagePriceExpected = (averagePeriodOne.add(averagePeriodTwo).add(averagePeriodThree).add(averagePeriodLast)).div(periodTotal);

      assertBNequal(
        await dexe.getAverageBalance(userOne),
        averagePriceExpected,
      );
    });

    it('should calculate average balance for user that deposited only in round 1, did not get or send tokens any more', async function() {
      const depositAmountUSDCuserOne = bn(1000000);
      const depositAmountUSDCuserTwo = bn(3000000);

      const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).div(FIRST_ROUND_SIZE);

      await ganache.setTime(saleStartTime);

      await dexe.depositUSDC(depositAmountUSDCuserOne, {
        from: userOne,
      });
      await dexe.depositUSDC(depositAmountUSDCuserTwo, {
        from: userTwo,
      });
      // 1st round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
      await dexe.prepareDistribution(1);

      assert.equal(await dexe.balanceOf(userOne), 0);
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 5);
      await dexe.receiveAll({from: userOne});

      const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);
      assertBNequal(await dexe.balanceOf(userOne), userOneDEXEBalance);

      // 2nd round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
      const uniswapPriceEndRoundTwo = 10;
      await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
      await dexe.prepareDistribution(2);
      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe);

      await dexe.receiveAll({from: userOne});

      assertBNequal((await dexe.holderRounds(22, userOne)).endBalance, userOneDEXEBalance);

      const timeNow = saleEndTime + ROUND_DURATION_SEC * 3;
      await ganache.setTime(timeNow);


      assertBNequal(
        await dexe.getAverageBalance(userOne),
        userOneDEXEBalance,
      );
    });

    it('should calculate 0 average balance for user that has no tokens', async function() {
      const depositAmountUSDCuserOne = bn(1000000);
      const depositAmountUSDCuserTwo = bn(3000000);

      const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).div(FIRST_ROUND_SIZE);

      await ganache.setTime(saleStartTime);

      await dexe.depositUSDC(depositAmountUSDCuserOne, {
        from: userOne,
      });
      await dexe.depositUSDC(depositAmountUSDCuserTwo, {
        from: userTwo,
      });
      // 1st round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
      await dexe.prepareDistribution(1);

      assert.equal(await dexe.balanceOf(userOne), 0);
      await dexe.receiveAll({from: userOne});

      const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);
      assertBNequal(await dexe.balanceOf(userOne), userOneDEXEBalance);

      // 2nd round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
      const uniswapPriceEndRoundTwo = 10;
      await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
      await dexe.prepareDistribution(2);
      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe);

      await dexe.receiveAll({from: userOne});

      assertBNequal((await dexe.holderRounds(22, userOne)).endBalance, userOneDEXEBalance);

      const timeNow = saleEndTime + ROUND_DURATION_SEC * 3;
      await ganache.setTime(timeNow);


      assertBNequal(
        await dexe.getAverageBalance(userThree),
        0,
      );
    });

    it('should calculate average balance for user that did not deposit and only get tokens after sale end', async function() {
      const depositAmountUSDCuserOne = bn(1000000);
      const depositAmountUSDCuserTwo = bn(3000000);

      await ganache.setTime(saleStartTime);

      await dexe.depositUSDC(depositAmountUSDCuserOne, {
        from: userOne,
      });
      await dexe.depositUSDC(depositAmountUSDCuserTwo, {
        from: userTwo,
      });
      // 1st round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
      await dexe.prepareDistribution(1);

      assert.equal(await dexe.balanceOf(userOne), 0);
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 5);
      await dexe.receiveAll({from: userOne});

      const userOneStakingLock = await dexe.locks(LockType.Staking, userOne);

      assert.equal(userOneStakingLock.released, 0);
      // 2nd round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
      const uniswapPriceEndRoundTwo = 10;
      await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
      await dexe.prepareDistribution(2);
      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe);

      await dexe.receiveAll({from: userOne});
      await dexe.receiveAll({from: userTwo});


      assertBNequal(
        await dexe.balanceOf(userThree),
        0,
      );

      await ganache.setTime(saleEndTime + 5);
      const transferToUserThreeAmountOne= bn(300000);
      await dexe.transfer(userThree, transferToUserThreeAmountOne, {from: userOne});
      assertBNequal(
        await dexe.balanceOf(userThree),
        transferToUserThreeAmountOne,
      );

      const firstTimeReceiveTokens = saleEndTime + 5;
      const secondTimeReceiveTokens = saleEndTime + ROUND_DURATION_SEC * 5;
      const timeNow = saleEndTime + ROUND_DURATION_SEC * 20;

      await ganache.setTime(secondTimeReceiveTokens);

      const transferToUserThreeAmountTwo = bn(100000);
      await dexe.transfer(userThree, transferToUserThreeAmountTwo, {from: userTwo});
      assertBNequal(
        await dexe.balanceOf(userThree),
        transferToUserThreeAmountOne.add(transferToUserThreeAmountTwo),
      );

      await ganache.setTime(timeNow);

      const periodOne = bn(secondTimeReceiveTokens - firstTimeReceiveTokens);
      const periodLast = bn(timeNow - secondTimeReceiveTokens);
      const periodTotal = periodOne.add(periodLast);

      const balancePeriodOne = transferToUserThreeAmountOne;
      const balanceAfterPeriodLast = transferToUserThreeAmountOne.add(transferToUserThreeAmountTwo);

      const averagePeriodOne = balancePeriodOne.mul(periodOne);
      const averagePeriodLast = balanceAfterPeriodLast.mul(periodLast);

      const averagePriceExpected = (averagePeriodOne.add(averagePeriodLast)).div(periodTotal);

      assertBNequal(
        await dexe.getAverageBalance(userThree),
        averagePriceExpected,
      );
    });


    it('should calculate average balance for user that deposited during sale, sent all coins and then receive same amount in the same day/time', async function() {
      const depositAmountUSDCuserOne = bn(1000000);
      const depositAmountUSDCuserTwo = bn(3000000);

      const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).div(FIRST_ROUND_SIZE);

      await ganache.setTime(saleStartTime);

      await dexe.depositUSDC(depositAmountUSDCuserOne, {
        from: userOne,
      });
      await dexe.depositUSDC(depositAmountUSDCuserTwo, {
        from: userTwo,
      });
      // 1st round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
      await dexe.prepareDistribution(1);

      assert.equal(await dexe.balanceOf(userOne), 0);
      await dexe.receiveAll({from: userOne});

      const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);
      assertBNequal(await dexe.balanceOf(userOne), userOneDEXEBalance);

      // 2nd round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
      const uniswapPriceEndRoundTwo = 10;
      await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
      await dexe.prepareDistribution(2);
      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe);

      await dexe.receiveAll({from: userOne});
      await dexe.receiveAll({from: userTwo});

      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance,
      );

      await dexe.transfer(userTwo, userOneDEXEBalance, {from: userOne});
      assertBNequal(
        await dexe.balanceOf(userOne),
        0,
      );

      await dexe.transfer(userOne, userOneDEXEBalance, {from: userTwo});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance,
      );

      const timeNow = saleEndTime + ROUND_DURATION_SEC * 16;

      await ganache.setTime(timeNow);

      const averagePriceExpected = userOneDEXEBalance;

      assertBNequal(
        await dexe.getAverageBalance(userOne),
        averagePriceExpected,
      );
    });

    it('should calculate average balance for user that deposited during sale, sent all coins and then receive same amount after 10 days', async function() {
      const depositAmountUSDCuserOne = bn(1000000);
      const depositAmountUSDCuserTwo = bn(3000000);

      const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).div(FIRST_ROUND_SIZE);

      await ganache.setTime(saleStartTime);

      await dexe.depositUSDC(depositAmountUSDCuserOne, {
        from: userOne,
      });
      await dexe.depositUSDC(depositAmountUSDCuserTwo, {
        from: userTwo,
      });
      // 1st round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
      await dexe.prepareDistribution(1);

      assert.equal(await dexe.balanceOf(userOne), 0);
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 5);
      await dexe.receiveAll({from: userOne});

      const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);

      const userOneStakingLock = await dexe.locks(LockType.Staking, userOne);

      assert.equal(userOneStakingLock.released, 0);
      // 2nd round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
      const uniswapPriceEndRoundTwo = 10;
      await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
      await dexe.prepareDistribution(2);
      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe);

      await ganache.setTime(saleEndTime);
      await dexe.receiveAll({from: userOne});
      await ganache.setTime(saleEndTime);
      await dexe.receiveAll({from: userTwo});

      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance,
      );

      await ganache.setTime(saleEndTime + 5);
      await dexe.transfer(userTwo, userOneDEXEBalance, {from: userOne});
      assertBNequal(
        await dexe.balanceOf(userOne),
        0,
      );

      const firstTimeReceiveTokens = saleStartTime + ROUND_DURATION_SEC + 5;
      const firstTimeSendTokens = saleEndTime + 5;
      const secondTimeReceiveTokens = saleEndTime + ROUND_DURATION_SEC * 10;
      const timeNow = saleEndTime + ROUND_DURATION_SEC * 25;

      await ganache.setTime(secondTimeReceiveTokens);

      await dexe.transfer(userOne, userOneDEXEBalance, {from: userTwo});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance,
      );

      const periodOne = bn(firstTimeSendTokens - firstTimeReceiveTokens);
      const periodTwo = bn(secondTimeReceiveTokens - firstTimeSendTokens);
      const periodLast = bn(timeNow - secondTimeReceiveTokens);
      const periodTotal = periodOne.add(periodTwo).add(periodLast);

      const balanceAfterFirstRound = userOneDEXEBalance;
      const balanceAfterFirstTimeSendTokens = bn(0);
      const balanceAfterPeriodLast = userOneDEXEBalance;

      const averagePeriodOne = balanceAfterFirstRound.mul(periodOne);
      const averagePeriodTwo = balanceAfterFirstTimeSendTokens.mul(periodTwo);
      const averagePeriodLast = balanceAfterPeriodLast.mul(periodLast);

      const averagePriceExpected = (averagePeriodOne.add(averagePeriodTwo).add(averagePeriodLast)).div(periodTotal);

      await ganache.setTime(timeNow);
      assertBNequal(
        await dexe.getAverageBalance(userOne),
        averagePriceExpected,
      );
    });

    it('should always calculate average price as 0 for contract address and zero address', async function() {
      const depositAmountUSDCuserOne = bn(1000000);
      const depositAmountUSDCuserTwo = bn(3000000);
      const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

      assertBNequal(
        await dexe.getAverageBalance(dexe.address),
        0,
      );
      assertBNequal(
        await dexe.getAverageBalance(ZERO_ADDRESS),
        0,
      );

      const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).div(FIRST_ROUND_SIZE);

      await ganache.setTime(saleStartTime);

      await dexe.depositUSDC(depositAmountUSDCuserOne, {
        from: userOne,
      });
      await dexe.depositUSDC(depositAmountUSDCuserTwo, {
        from: userTwo,
      });
      // 1st round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
      await dexe.prepareDistribution(1);

      assert.equal(await dexe.balanceOf(userOne), 0);
      await dexe.receiveAll({from: userOne});

      const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);

      const userOneStakingLock = await dexe.locks(LockType.Staking, userOne);

      assert.equal(userOneStakingLock.released, 0);
      // 2nd round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
      const uniswapPriceEndRoundTwo = 10;
      await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
      await dexe.prepareDistribution(2);
      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe);

      await dexe.receiveAll({from: userOne});
      await dexe.receiveAll({from: userTwo});

      assertBNequal(
        await dexe.getAverageBalance(dexe.address),
        0,
      );
      assertBNequal(
        await dexe.getAverageBalance(ZERO_ADDRESS),
        0,
      );

      await dexe.transfer(userTwo, userOneDEXEBalance, {from: userOne});
      assertBNequal(
        await dexe.getAverageBalance(dexe.address),
        0,
      );
      assertBNequal(
        await dexe.getAverageBalance(ZERO_ADDRESS),
        0,
      );

      const secondTimeReceiveTokens = saleEndTime + ROUND_DURATION_SEC * 10;
      const timeNow = saleEndTime + ROUND_DURATION_SEC * 25;

      await ganache.setTime(secondTimeReceiveTokens);

      assertBNequal(
        await dexe.getAverageBalance(dexe.address),
        0,
      );
      assertBNequal(
        await dexe.getAverageBalance(ZERO_ADDRESS),
        0,
      );

      await dexe.transfer(userOne, userOneDEXEBalance, {from: userTwo});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance,
      );

      await ganache.setTime(timeNow);

      assertBNequal(
        await dexe.getAverageBalance(dexe.address),
        0,
      );
      assertBNequal(
        await dexe.getAverageBalance(ZERO_ADDRESS),
        0,
      );
    });
  });

  describe('After product launched', async () => {
    it('should calculate average price from first receive tokens till launch product time in time range 0-29.9 days after launch', async function() {
      const depositAmountUSDCuserOne = bn(1000000);
      const depositAmountUSDCuserTwo = bn(3000000);

      const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).div(FIRST_ROUND_SIZE);

      await ganache.setTime(saleStartTime);

      await dexe.depositUSDC(depositAmountUSDCuserOne, {
        from: userOne,
      });
      await dexe.depositUSDC(depositAmountUSDCuserTwo, {
        from: userTwo,
      });
      // 1st round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
      await dexe.prepareDistribution(1);

      assert.equal(await dexe.balanceOf(userOne), 0);
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 5);
      await dexe.receiveAll({from: userOne});

      const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);
      assertBNequal(await dexe.balanceOf(userOne), userOneDEXEBalance);

      const userOneStakingLock = await dexe.locks(LockType.Staking, userOne);

      assert.equal(userOneStakingLock.released, 0);
      // 2nd round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
      const uniswapPriceEndRoundTwo = 10;
      await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
      await dexe.prepareDistribution(2);
      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe);

      await dexe.receiveAll({from: userOne});
      await dexe.receiveAll({from: userTwo});

      assertBNequal((await dexe.holderRounds(22, userOne)).endBalance, userOneDEXEBalance);

      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance,
      );

      await ganache.setTime(saleEndTime + 5);
      const transferToUserTwoAmount = bn(300000);
      await dexe.transfer(userTwo, transferToUserTwoAmount, {from: userOne});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.sub(transferToUserTwoAmount),
      );

      const firstTimeReceiveTokens = saleStartTime + ROUND_DURATION_SEC + 5;
      const firstTimeSendTokens = saleEndTime + 5;
      const secondTimeReceiveTokens = saleEndTime + ROUND_DURATION_SEC * 3;
      const thirdTimeReceiveTokens = saleEndTime + ROUND_DURATION_SEC * 13;
      const timePeriodLastBeforeLaunch = saleEndTime + ROUND_DURATION_SEC * 16;

      await ganache.setTime(secondTimeReceiveTokens);

      const transferOneToUserOneAmount = bn(100000);
      await dexe.transfer(userOne, transferOneToUserOneAmount, {from: userTwo});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.sub(transferToUserTwoAmount).add(transferOneToUserOneAmount),
      );

      await ganache.setTime(thirdTimeReceiveTokens);

      const transferTwoToUserOneAmount = bn(50000);
      await dexe.transfer(userOne, transferTwoToUserOneAmount, {from: userTwo});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.sub(transferToUserTwoAmount).add(transferOneToUserOneAmount).add(transferTwoToUserOneAmount),
      );

      await ganache.setTime(timePeriodLastBeforeLaunch);

      const periodOne = bn(firstTimeSendTokens - firstTimeReceiveTokens);
      const periodTwo = bn(secondTimeReceiveTokens - firstTimeSendTokens);
      const periodThree = bn(thirdTimeReceiveTokens - secondTimeReceiveTokens);
      const periodLast = bn(timePeriodLastBeforeLaunch - thirdTimeReceiveTokens);
      const periodTotal = periodOne.add(periodTwo).add(periodThree).add(periodLast);

      const balanceAfterFirstRound = userOneDEXEBalance;
      const balanceAfterFirstTimeSendTokens = userOneDEXEBalance.sub(transferToUserTwoAmount);
      const balanceAfterSecondTimeReceiveTokens = balanceAfterFirstTimeSendTokens.add(transferOneToUserOneAmount);
      const balanceAfterPeriodLast = balanceAfterSecondTimeReceiveTokens.add(transferTwoToUserOneAmount);

      const averagePeriodOne = balanceAfterFirstRound.mul(periodOne);
      const averagePeriodTwo = balanceAfterFirstTimeSendTokens.mul(periodTwo);
      const averagePeriodThree = balanceAfterSecondTimeReceiveTokens.mul(periodThree);
      const averagePeriodLast = balanceAfterPeriodLast.mul(periodLast);

      const averagePriceExpected = (averagePeriodOne.add(averagePeriodTwo).add(averagePeriodThree).add(averagePeriodLast)).div(periodTotal);

      assertBNequal(
        await dexe.getAverageBalance(userOne),
        averagePriceExpected,
      );

      const timeLaunch = timePeriodLastBeforeLaunch;
      await ganache.setTime(timeLaunch);
      await dexe.launchProduct();

      await ganache.setTime(thirdTimeReceiveTokens);

      const transferAfterLaunchToUserOneAmount = bn(50000);

      const oneDayAfterLaunchTime = timeLaunch + DAY_IN_SEC * 1;
      await ganache.setTime(oneDayAfterLaunchTime);
      await dexe.transfer(userOne, transferAfterLaunchToUserOneAmount, {from: userTwo});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.sub(transferToUserTwoAmount).add(transferOneToUserOneAmount)
        .add(transferTwoToUserOneAmount).add(transferAfterLaunchToUserOneAmount),
      );

      const twentyNineDaysAfterLaunchTime = timeLaunch + DAY_IN_SEC * 29.9;
      await ganache.setTime(twentyNineDaysAfterLaunchTime);

      assertBNequal(
        await dexe.getAverageBalance(userOne),
        averagePriceExpected,
      );
    });

    it('should calculate average price for 1st month(0-29.9) after product launch when current time is 30 days after launch', async function() {
      const depositAmountUSDCuserOne = bn(1000000);
      const depositAmountUSDCuserTwo = bn(3000000);

      const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).div(FIRST_ROUND_SIZE);

      await ganache.setTime(saleStartTime);

      await dexe.depositUSDC(depositAmountUSDCuserOne, {
        from: userOne,
      });
      await dexe.depositUSDC(depositAmountUSDCuserTwo, {
        from: userTwo,
      });
      // 1st round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
      await dexe.prepareDistribution(1);

      assert.equal(await dexe.balanceOf(userOne), 0);
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 5);
      await dexe.receiveAll({from: userOne});

      const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);
      assertBNequal(await dexe.balanceOf(userOne), userOneDEXEBalance);

      const userOneStakingLock = await dexe.locks(LockType.Staking, userOne);

      assert.equal(userOneStakingLock.released, 0);
      // 2nd round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
      const uniswapPriceEndRoundTwo = 10;
      await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
      await dexe.prepareDistribution(2);
      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe);

      await dexe.receiveAll({from: userOne});
      await dexe.receiveAll({from: userTwo});

      assertBNequal((await dexe.holderRounds(22, userOne)).endBalance, userOneDEXEBalance);

      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance,
      );

      await ganache.setTime(saleEndTime + 5);
      const transferToUserTwoAmount = bn(300000);
      await dexe.transfer(userTwo, transferToUserTwoAmount, {from: userOne});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.sub(transferToUserTwoAmount),
      );

      const secondTimeReceiveTokens = saleEndTime + ROUND_DURATION_SEC * 3;
      const thirdTimeReceiveTokens = saleEndTime + ROUND_DURATION_SEC * 13;
      const timePeriodLastBeforeLaunch = saleEndTime + ROUND_DURATION_SEC * 16;

      await ganache.setTime(secondTimeReceiveTokens);

      const transferOneToUserOneAmount = bn(100000);
      await dexe.transfer(userOne, transferOneToUserOneAmount, {from: userTwo});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.sub(transferToUserTwoAmount).add(transferOneToUserOneAmount),
      );

      await ganache.setTime(thirdTimeReceiveTokens);

      const transferTwoToUserOneAmount = bn(50000);
      await dexe.transfer(userOne, transferTwoToUserOneAmount, {from: userTwo});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.sub(transferToUserTwoAmount).add(transferOneToUserOneAmount).add(transferTwoToUserOneAmount),
      );

      await ganache.setTime(timePeriodLastBeforeLaunch);

      const timeLaunch = timePeriodLastBeforeLaunch;
      await ganache.setTime(timeLaunch);
      await dexe.launchProduct();

      const transferAfterLaunchToUserOneAmount = bn(50000);

      const oneDayAfterLaunchTime = timeLaunch + DAY_IN_SEC * 1;
      await ganache.setTime(oneDayAfterLaunchTime);
      await dexe.transfer(userOne, transferAfterLaunchToUserOneAmount, {from: userTwo});

      const oneDayAfterLaunchBalance = userOneDEXEBalance.sub(transferToUserTwoAmount)
      .add(transferOneToUserOneAmount).add(transferTwoToUserOneAmount).add(transferAfterLaunchToUserOneAmount);
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.sub(transferToUserTwoAmount).add(transferOneToUserOneAmount)
        .add(transferTwoToUserOneAmount).add(transferAfterLaunchToUserOneAmount),
      );

      const thirtyDaysAfterLaunchTime = timeLaunch + DAY_IN_SEC * 30;
      await ganache.setTime(thirtyDaysAfterLaunchTime);

      const userBalanceOnLaunched = userOneDEXEBalance.sub(transferToUserTwoAmount).add(transferOneToUserOneAmount).add(transferTwoToUserOneAmount);
      const averagePeriodOneAfterLaunch = userBalanceOnLaunched.mul(bn(DAY_IN_SEC));
      const averagePeriodLastAfterLaunch = oneDayAfterLaunchBalance.mul(bn(DAY_IN_SEC * 29));
      assertBNequal(
        await dexe.getAverageBalance(userOne),
        averagePeriodOneAfterLaunch.add(averagePeriodLastAfterLaunch).div(bn(DAY_IN_SEC * 30)),
      );
    });

    it('should calculate average price same for all months if user last receive tokens only in 1st month after launch and current time is 10th month', async function() {
      const depositAmountUSDCuserOne = bn(1000000);
      const depositAmountUSDCuserTwo = bn(3000000);

      const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).div(FIRST_ROUND_SIZE);

      await ganache.setTime(saleStartTime);

      await dexe.depositUSDC(depositAmountUSDCuserOne, {
        from: userOne,
      });
      await dexe.depositUSDC(depositAmountUSDCuserTwo, {
        from: userTwo,
      });
      // 1st round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
      await dexe.prepareDistribution(1);

      assert.equal(await dexe.balanceOf(userOne), 0);
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 5);
      await dexe.receiveAll({from: userOne});

      const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);
      assertBNequal(await dexe.balanceOf(userOne), userOneDEXEBalance);

      const userOneStakingLock = await dexe.locks(LockType.Staking, userOne);

      assert.equal(userOneStakingLock.released, 0);
      // 2nd round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
      const uniswapPriceEndRoundTwo = 10;
      await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
      await dexe.prepareDistribution(2);
      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe);

      await dexe.receiveAll({from: userOne});
      await dexe.receiveAll({from: userTwo});

      assertBNequal((await dexe.holderRounds(22, userOne)).endBalance, userOneDEXEBalance);

      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance,
      );

      await ganache.setTime(saleEndTime + 5);
      const transferToUserTwoAmount = bn(300000);
      await dexe.transfer(userTwo, transferToUserTwoAmount, {from: userOne});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.sub(transferToUserTwoAmount),
      );

      const secondTimeReceiveTokens = saleEndTime + ROUND_DURATION_SEC * 3;
      const thirdTimeReceiveTokens = saleEndTime + ROUND_DURATION_SEC * 13;
      const timePeriodLastBeforeLaunch = saleEndTime + ROUND_DURATION_SEC * 16;

      await ganache.setTime(secondTimeReceiveTokens);

      const transferOneToUserOneAmount = bn(100000);
      await dexe.transfer(userOne, transferOneToUserOneAmount, {from: userTwo});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.sub(transferToUserTwoAmount).add(transferOneToUserOneAmount),
      );

      await ganache.setTime(thirdTimeReceiveTokens);

      const transferTwoToUserOneAmount = bn(50000);
      await dexe.transfer(userOne, transferTwoToUserOneAmount, {from: userTwo});

      await ganache.setTime(timePeriodLastBeforeLaunch);

      const timeLaunch = timePeriodLastBeforeLaunch;
      await ganache.setTime(timeLaunch);
      await dexe.launchProduct();

      const transferAfterLaunchToUserOneAmount = bn(50000);

      const oneDayAfterLaunchTime = timeLaunch + DAY_IN_SEC * 1;
      await ganache.setTime(oneDayAfterLaunchTime);
      await dexe.transfer(userOne, transferAfterLaunchToUserOneAmount, {from: userTwo});

      const oneDayAfterLaunchBalance = userOneDEXEBalance.sub(transferToUserTwoAmount)
      .add(transferOneToUserOneAmount).add(transferTwoToUserOneAmount).add(transferAfterLaunchToUserOneAmount);

      const tenMonthsAfterLaunchTime = timeLaunch + DAY_IN_SEC * 300;
      await ganache.setTime(tenMonthsAfterLaunchTime);

      assertBNequal(
        await dexe.getAverageBalance(userOne),
        oneDayAfterLaunchBalance,
      );
    });

    it('should calculate average price for 2nd month(30-59.9) as 0 if user sent all tokens in 1st month and current time is 3rd month', async function() {
      const depositAmountUSDCuserOne = bn(1000000);
      const depositAmountUSDCuserTwo = bn(3000000);

      const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).div(FIRST_ROUND_SIZE);

      await ganache.setTime(saleStartTime);

      await dexe.depositUSDC(depositAmountUSDCuserOne, {
        from: userOne,
      });
      await dexe.depositUSDC(depositAmountUSDCuserTwo, {
        from: userTwo,
      });
      // 1st round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
      await dexe.prepareDistribution(1);

      assert.equal(await dexe.balanceOf(userOne), 0);
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 5);
      await dexe.receiveAll({from: userOne});

      const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);
      assertBNequal(await dexe.balanceOf(userOne), userOneDEXEBalance);

      const userOneStakingLock = await dexe.locks(LockType.Staking, userOne);

      assert.equal(userOneStakingLock.released, 0);
      // 2nd round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
      const uniswapPriceEndRoundTwo = 10;
      await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
      await dexe.prepareDistribution(2);
      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe);

      await dexe.receiveAll({from: userOne});
      await dexe.receiveAll({from: userTwo});

      assertBNequal((await dexe.holderRounds(22, userOne)).endBalance, userOneDEXEBalance);

      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance,
      );

      await ganache.setTime(saleEndTime + 5);
      const transferToUserTwoAmount = bn(300000);
      await dexe.transfer(userTwo, transferToUserTwoAmount, {from: userOne});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.sub(transferToUserTwoAmount),
      );

      const secondTimeReceiveTokens = saleEndTime + ROUND_DURATION_SEC * 3;
      const thirdTimeReceiveTokens = saleEndTime + ROUND_DURATION_SEC * 13;
      const timePeriodLastBeforeLaunch = saleEndTime + ROUND_DURATION_SEC * 16;

      await ganache.setTime(secondTimeReceiveTokens);

      const transferOneToUserOneAmount = bn(100000);
      await dexe.transfer(userOne, transferOneToUserOneAmount, {from: userTwo});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.sub(transferToUserTwoAmount).add(transferOneToUserOneAmount),
      );

      await ganache.setTime(thirdTimeReceiveTokens);

      const transferTwoToUserOneAmount = bn(50000);
      await dexe.transfer(userOne, transferTwoToUserOneAmount, {from: userTwo});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.sub(transferToUserTwoAmount).add(transferOneToUserOneAmount).add(transferTwoToUserOneAmount),
      );

      await ganache.setTime(timePeriodLastBeforeLaunch);

      const timeLaunch = timePeriodLastBeforeLaunch;
      await ganache.setTime(timeLaunch);
      await dexe.launchProduct();

      const oneDayAfterLaunchTime = timeLaunch + DAY_IN_SEC * 1;
      await ganache.setTime(oneDayAfterLaunchTime);
      const uerOneBalance = userOneDEXEBalance.sub(transferToUserTwoAmount).add(transferOneToUserOneAmount).add(transferTwoToUserOneAmount);
      await dexe.transfer(userTwo, uerOneBalance, {from: userOne});


      assertBNequal(
        await dexe.balanceOf(userOne),
        0,
      );

      const eightyNineDaysAfterLaunchTime = timeLaunch + DAY_IN_SEC * 89;
      await ganache.setTime(eightyNineDaysAfterLaunchTime);

      assertBNequal(
        await dexe.getAverageBalance(userOne),
        0,
      );
    });

    it('should calculate average price for 1st month(0-29.9) after product launch when current time is 30 days after launch and user did force release on 1st month', async function() {
      const depositAmountUSDCuserOne = bn(1000000);
      const depositAmountUSDCuserTwo = bn(3000000);

      const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).div(FIRST_ROUND_SIZE);

      await ganache.setTime(saleStartTime);

      await dexe.depositUSDC(depositAmountUSDCuserOne, {
        from: userOne,
      });
      await dexe.depositUSDC(depositAmountUSDCuserTwo, {
        from: userTwo,
      });
      // 1st round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
      await dexe.prepareDistribution(1);

      assert.equal(await dexe.balanceOf(userOne), 0);
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 5);
      await dexe.receiveAll({from: userOne});

      const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);
      assertBNequal(await dexe.balanceOf(userOne), userOneDEXEBalance);

      const userOneStakingLock = await dexe.locks(LockType.Staking, userOne);

      assert.equal(userOneStakingLock.released, 0);
      // 2nd round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
      const uniswapPriceEndRoundTwo = 10;
      await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
      await dexe.prepareDistribution(2);
      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe);

      await dexe.receiveAll({from: userOne});
      await dexe.receiveAll({from: userTwo});

      assertBNequal((await dexe.holderRounds(22, userOne)).endBalance, userOneDEXEBalance);

      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance,
      );

      const timePeriodLastBeforeLaunch = saleEndTime + ROUND_DURATION_SEC * 16;


      await ganache.setTime(timePeriodLastBeforeLaunch);

      const timeLaunch = timePeriodLastBeforeLaunch;
      await ganache.setTime(timeLaunch);
      await dexe.launchProduct();

      const oneDayAfterLaunchTime = timeLaunch + DAY_IN_SEC * 1;
      await ganache.setTime(oneDayAfterLaunchTime);

      const userOneStakingLockRoundOne = userOneDEXEBalance.mul(bn(5)).div(bn(100));
      const userOneStakingLockAllRounds = userOneDEXEBalance.mul(bn(20)).div(bn(100)).mul(bn(20));
      const userOneTenPercentStaking = userOneStakingLockRoundOne.add(userOneStakingLockAllRounds).mul(bn(10)).div(bn(100));

      const userOneX7Commission = userOneTenPercentStaking.mul(bn(14)).div(bn(100));


      await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo * 10);
      await dexe.forceReleaseStaking(ForceReleaseType.X7, {from: userOne});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.add(userOneTenPercentStaking).sub(userOneX7Commission),
      );

      const oneDayAfterLaunchBalance = userOneDEXEBalance.add(userOneTenPercentStaking).sub(userOneX7Commission);

      const thirtyDaysAfterLaunchTime = timeLaunch + DAY_IN_SEC * 30;
      await ganache.setTime(thirtyDaysAfterLaunchTime);

      const userBalanceOnLaunched = userOneDEXEBalance;
      const averagePeriodOneAfterLaunch = userBalanceOnLaunched.mul(bn(DAY_IN_SEC));
      const averagePeriodLastAfterLaunch = oneDayAfterLaunchBalance.mul(bn(DAY_IN_SEC * 29));
      assertBNequal(
        await dexe.getAverageBalance(userOne),
        averagePeriodOneAfterLaunch.add(averagePeriodLastAfterLaunch).div(bn(DAY_IN_SEC * 30)),
      );
    });

    it('should calculate average price for 1st month(0-29.9) after product launch when current time is 30 days after launch and user did release on 1st month', async function() {
      const depositAmountUSDCuserOne = bn(1000000);
      const depositAmountUSDCuserTwo = bn(3000000);

      const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).div(FIRST_ROUND_SIZE);

      await ganache.setTime(saleStartTime);

      await dexe.depositUSDC(depositAmountUSDCuserOne, {
        from: userOne,
      });
      await dexe.depositUSDC(depositAmountUSDCuserTwo, {
        from: userTwo,
      });
      // 1st round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
      await dexe.prepareDistribution(1);

      assert.equal(await dexe.balanceOf(userOne), 0);
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 5);
      await dexe.receiveAll({from: userOne});

      const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);
      assertBNequal(await dexe.balanceOf(userOne), userOneDEXEBalance);

      const userOneStakingLock = await dexe.locks(LockType.Staking, userOne);

      assert.equal(userOneStakingLock.released, 0);
      // 2nd round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
      const uniswapPriceEndRoundTwo = 10;
      await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
      await dexe.prepareDistribution(2);
      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe);

      await dexe.receiveAll({from: userOne});
      await dexe.receiveAll({from: userTwo});

      assertBNequal((await dexe.holderRounds(22, userOne)).endBalance, userOneDEXEBalance);

      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance,
      );

      const timePeriodLastBeforeLaunch = saleEndTime + ROUND_DURATION_SEC * 365 * 4;

      await ganache.setTime(timePeriodLastBeforeLaunch);

      const timeLaunch = timePeriodLastBeforeLaunch;
      await ganache.setTime(timeLaunch);
      await dexe.launchProduct();

      const oneDayAfterLaunchTime = timeLaunch + DAY_IN_SEC * 1;
      await ganache.setTime(oneDayAfterLaunchTime);

      const userOneStakingLockRoundOne = userOneDEXEBalance.mul(bn(5)).div(bn(100));
      const userOneStakingLockAllRounds = userOneDEXEBalance.mul(bn(20)).div(bn(100)).mul(bn(20));

      await dexe.releaseLock(LockType.Staking, {from: userOne});
      assertBNequal(
        await dexe.balanceOf(userOne),
        userOneDEXEBalance.add(userOneStakingLockRoundOne).add(userOneStakingLockAllRounds),
      );

      const oneDayAfterLaunchBalance = userOneDEXEBalance.add(userOneStakingLockRoundOne).add(userOneStakingLockAllRounds);

      const thirtyDaysAfterLaunchTime = timeLaunch + DAY_IN_SEC * 30;
      await ganache.setTime(thirtyDaysAfterLaunchTime);

      const userBalanceOnLaunched = userOneDEXEBalance;
      const averagePeriodOneAfterLaunch = userBalanceOnLaunched.mul(bn(DAY_IN_SEC));
      const averagePeriodLastAfterLaunch = oneDayAfterLaunchBalance.mul(bn(DAY_IN_SEC * 29));
      assertBNequal(
        await dexe.getAverageBalance(userOne),
        averagePeriodOneAfterLaunch.add(averagePeriodLastAfterLaunch).div(bn(DAY_IN_SEC * 30)),
      );
    });

    it('should always calculate average price as 0 for contract address and zero address and current time is 3 month after launch', async function() {
      const depositAmountUSDCuserOne = bn(1000000);
      const depositAmountUSDCuserTwo = bn(3000000);
      const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

      const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).div(FIRST_ROUND_SIZE);

      await ganache.setTime(saleStartTime);

      await dexe.depositUSDC(depositAmountUSDCuserOne, {
        from: userOne,
      });
      await dexe.depositUSDC(depositAmountUSDCuserTwo, {
        from: userTwo,
      });
      // 1st round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
      await dexe.prepareDistribution(1);

      assert.equal(await dexe.balanceOf(userOne), 0);
      await dexe.receiveAll({from: userOne});

      const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);

      const userOneStakingLock = await dexe.locks(LockType.Staking, userOne);

      assert.equal(userOneStakingLock.released, 0);
      // 2nd round end
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
      const uniswapPriceEndRoundTwo = 10;
      await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
      await dexe.prepareDistribution(2);
      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe);

      await dexe.receiveAll({from: userOne});
      await dexe.receiveAll({from: userTwo});

      const secondTimeReceiveTokens = saleEndTime + ROUND_DURATION_SEC * 10;

      await ganache.setTime(secondTimeReceiveTokens);

      assertBNequal(
        await dexe.getAverageBalance(dexe.address),
        0,
      );
      assertBNequal(
        await dexe.getAverageBalance(ZERO_ADDRESS),
        0,
      );

      const launchProduct = saleEndTime + ROUND_DURATION_SEC * 25;
      await ganache.setTime(launchProduct);
      await dexe.launchProduct();

      await dexe.transfer(userOne, userOneDEXEBalance, {from: userTwo});

      await ganache.setTime(launchProduct + DAY_IN_SEC * 90);

      assertBNequal(
        await dexe.getAverageBalance(dexe.address),
        0,
      );
      assertBNequal(
        await dexe.getAverageBalance(ZERO_ADDRESS),
        0,
      );
    });
  });

  describe('At all times', async () => {
    it('should calculate average balance < launch > only transfer < 30 days > < 60 days >', async () => {
      const userOneTransferBalance1 = bn(1000000);

      await ganache.setTime(saleStartTime);

      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe, 1);

      const launchTime = saleEndTime + 1000;

      await ganache.setTime(launchTime);
      await dexe.launchProduct();

      await ganache.setTime(launchTime + 1000);

      await dexe.transfer(userOne, userOneTransferBalance1, {
        from: OWNER,
      });

      assertBNequal(await dexe.getAverageBalance(userOne), bn(0));

      await ganache.setTime(launchTime + 1000 + MONTH);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(999614));

      await ganache.setTime(launchTime + 1000 + MONTH * 2);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(1000000));
    });

    it('should calculate average balance < launch > < 30 days > only transfer < 60 days >', async () => {
      const userOneTransferBalance1 = bn(1000000);

      await ganache.setTime(saleStartTime);

      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe, 1);

      const launchTime = saleEndTime + 1000;

      await ganache.setTime(launchTime);
      await dexe.launchProduct();

      await ganache.setTime(launchTime + 1000);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(0));

      await ganache.setTime(launchTime + 1000 + MONTH);

      await dexe.transfer(userOne, userOneTransferBalance1, {
        from: OWNER,
      });

      assertBNequal(await dexe.getAverageBalance(userOne), bn(0));

      await ganache.setTime(launchTime + 1000 + MONTH * 2);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(999614));
    });

    it('should calculate average balance < launch > < 30 days > < 60 days > only transfer', async () => {
      const userOneTransferBalance1 = bn(1000000);

      await ganache.setTime(saleStartTime);

      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe, 1);

      const launchTime = saleEndTime + 1000;

      await ganache.setTime(launchTime);
      await dexe.launchProduct();

      await ganache.setTime(launchTime + 1000);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(0));

      await ganache.setTime(launchTime + 1000 + MONTH);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(0));

      await ganache.setTime(launchTime + 1000 + MONTH * 2);

      await dexe.transfer(userOne, userOneTransferBalance1, {
        from: OWNER,
      });

      assertBNequal(await dexe.getAverageBalance(userOne), bn(0));
    });

    it('should calculate average balance first transfer, last transfer < launch > < 30 days > < 60 days >', async () => {
      const userOneTransferBalance1 = bn(1000000);
      const userOneTransferBalance2 = bn(2000000);

      await ganache.setTime(saleStartTime);
      await dexe.transfer(userOne, userOneTransferBalance1, {
        from: OWNER,
      });

      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe, 1);

      await ganache.setTime(saleEndTime);
      await dexe.transfer(userOne, userOneTransferBalance2, {
        from: OWNER,
      });
      const launchTime = saleEndTime + 1000;

      await ganache.setTime(launchTime);
      await dexe.launchProduct();

      await ganache.setTime(launchTime + 1000);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(1001051));

      await ganache.setTime(launchTime + 1000 + MONTH);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(3000000));

      await ganache.setTime(launchTime + 1000 + MONTH * 2);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(3000000));
    });

    it('should calculate average balance first transfer < launch > last transfer < 30 days > < 60 days >', async () => {
      const userOneTransferBalance1 = bn(1000000);
      const userOneTransferBalance2 = bn(2000000);

      await ganache.setTime(saleStartTime);
      await dexe.transfer(userOne, userOneTransferBalance1, {
        from: OWNER,
      });

      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe, 1);

      const launchTime = saleEndTime + 1000;

      await ganache.setTime(launchTime);
      await dexe.launchProduct();

      await ganache.setTime(launchTime + 1000);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(1000000));

      await dexe.transfer(userOne, userOneTransferBalance2, {
        from: OWNER,
      });

      await ganache.setTime(launchTime + 1000 + MONTH);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(2999228));

      await ganache.setTime(launchTime + 1000 + MONTH * 2);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(3000000));
    });

    it('should calculate average balance < sale end > first transfer < launch last transfer > < 30 days > < 60 days >', async () => {
      const userOneTransferBalance1 = bn(1000000);
      const userOneTransferBalance2 = bn(2000000);

      await ganache.setTime(saleEndTime + DAY_IN_SEC);
      await prepareDistributions(dexe, 1);

      await ganache.setTime(saleEndTime + DAY_IN_SEC + 1);
      await dexe.transfer(userOne, userOneTransferBalance1, {
        from: OWNER,
      });
      const launchTime = saleEndTime + 2 * DAY_IN_SEC;
      await ganache.setTime(launchTime);
      await dexe.launchProduct();

      await dexe.transfer(userOne, userOneTransferBalance2, {
        from: OWNER,
      });
      await ganache.setTime(launchTime + DAY_IN_SEC);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(1000000));
    });

    it('should calculate average balance first transfer < launch > < 30 days > last transfer < 60 days >', async () => {
      const userOneTransferBalance1 = bn(1000000);
      const userOneTransferBalance2 = bn(2000000);

      await ganache.setTime(saleStartTime);
      await dexe.transfer(userOne, userOneTransferBalance1, {
        from: OWNER,
      });

      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe, 1);

      const launchTime = saleEndTime + 1000;

      await ganache.setTime(launchTime);
      await dexe.launchProduct();

      await ganache.setTime(launchTime + 1000);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(1000000));

      await ganache.setTime(launchTime + 1000 + MONTH);

      await dexe.transfer(userOne, userOneTransferBalance2, {
        from: OWNER,
      });

      assertBNequal(await dexe.getAverageBalance(userOne), bn(1000000));

      await ganache.setTime(launchTime + 1000 + MONTH * 2);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(2999228));
    });

    it('should calculate average balance first transfer < launch > < 30 days > < 60 days > last transfer', async () => {
      const userOneTransferBalance1 = bn(1000000);
      const userOneTransferBalance2 = bn(2000000);

      await ganache.setTime(saleStartTime);
      await dexe.transfer(userOne, userOneTransferBalance1, {
        from: OWNER,
      });

      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe, 1);

      const launchTime = saleEndTime + 1000;

      await ganache.setTime(launchTime);
      await dexe.launchProduct();

      await ganache.setTime(launchTime + 1000);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(1000000));

      await ganache.setTime(launchTime + 1000 + MONTH);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(1000000));

      await ganache.setTime(launchTime + 1000 + MONTH * 2);

      await dexe.transfer(userOne, userOneTransferBalance2, {
        from: OWNER,
      });

      assertBNequal(await dexe.getAverageBalance(userOne), bn(1000000));
    });

    it('should calculate average balance < launch > first transfer, transfer < 30 days > last transfer < 60 days >', async () => {
      const userOneTransferBalance1 = bn(1000000);
      const userOneTransferBalance2 = bn(2000000);

      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe, 1);

      const launchTime = saleEndTime + 1000;

      await ganache.setTime(launchTime);
      await dexe.launchProduct();

      await ganache.setTime(launchTime + 1000);

      await dexe.transfer(userOne, userOneTransferBalance1, {
        from: OWNER,
      });

      await ganache.setTime(launchTime + 100000);

      await dexe.transfer(userOne, userOneTransferBalance2, {
        from: OWNER,
      });

      assertBNequal(await dexe.getAverageBalance(userOne), bn(0));

      await ganache.setTime(launchTime + 1000 + MONTH);

      await dexe.transfer(userOne, userOneTransferBalance2, {
        from: OWNER,
      });

      assertBNequal(await dexe.getAverageBalance(userOne), bn(2922453));

      await ganache.setTime(launchTime + 1000 + MONTH * 2);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(4999228));
    });

    it('should calculate average balance < launch > first transfer < 30 days > < 60 days > transfer, last transfer', async () => {
      const userOneTransferBalance1 = bn(1000000);
      const userOneTransferBalance2 = bn(2000000);

      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe, 1);

      const launchTime = saleEndTime + 1000;

      await ganache.setTime(launchTime);
      await dexe.launchProduct();

      await ganache.setTime(launchTime + 1000);

      await dexe.transfer(userOne, userOneTransferBalance1, {
        from: OWNER,
      });

      assertBNequal(await dexe.getAverageBalance(userOne), bn(0));

      await ganache.setTime(launchTime + 1000 + MONTH);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(999614));

      await ganache.setTime(launchTime + 1000 + MONTH * 2);

      await dexe.transfer(userOne, userOneTransferBalance2, {
        from: OWNER,
      });

      await ganache.setTime(launchTime + 100000 + MONTH * 2);

      await dexe.transfer(userOne, userOneTransferBalance2, {
        from: OWNER,
      });

      assertBNequal(await dexe.getAverageBalance(userOne), bn(1000000));
    });

    it('should calculate average balance correctly with few transfers between 2 users in every section', async () => {
      const userOneTransferBalance1 = bn(1000000);
      const userOneTransferBalance2 = bn(2000000);

      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe, 1);

      await ganache.setTime(saleEndTime);
      await dexe.transfer(userTwo, userOneTransferBalance1, {
        from: OWNER,
      });

      await ganache.setTime(saleEndTime + 1000);
      await dexe.transfer(userOne, userOneTransferBalance2, {
        from: OWNER,
      });

      await ganache.setTime(saleEndTime + 1000);
      await dexe.transfer(userTwo, userOneTransferBalance1, {
        from: userOne,
      });

      const launchTime = saleEndTime + 1000000;

      await ganache.setTime(launchTime);
      await dexe.launchProduct();

      await ganache.setTime(launchTime + 1000);

      await dexe.transfer(userTwo, userOneTransferBalance1, {
        from: OWNER,
      });

      await ganache.setTime(launchTime + 100000);

      await dexe.transfer(userOne, userOneTransferBalance2, {
        from: userTwo,
      });

      assertBNequal(await dexe.getAverageBalance(userOne), bn(1000000));
      assertBNequal(await dexe.getAverageBalance(userTwo), bn(1999000));

      await ganache.setTime(launchTime + 1000 + MONTH);

      await dexe.transfer(userTwo, userOneTransferBalance2, {
        from: userOne,
      });
      assertBNequal(await dexe.getAverageBalance(userOne), bn(2922839));
      assertBNequal(await dexe.getAverageBalance(userTwo), bn(1076774));

      await ganache.setTime(launchTime + 1000 + MONTH * 2);

      await dexe.transfer(userOne, userOneTransferBalance2, {
        from: userTwo,
      });

      assertBNequal(await dexe.getAverageBalance(userOne), bn(1000771));
      assertBNequal(await dexe.getAverageBalance(userTwo), bn(2999228));
    });

    it('should calculate average balance with few transfers in one transction < launch > < 30 days > < 60 days >', async () => {
      const userOneTransferBalance1 = bn(1000000);
      const userOneTransferBalance2 = bn(2000000);

      const amount1 = bn('1321231');
      const amount2 = bn('636223');
      const amount3 = bn('7828389');

      await ganache.setTime(saleStartTime);
      await dexe.transfer(userOne, userOneTransferBalance1, {
        from: OWNER,
      });

      await dexe.approve(transfersWrapper.address, bn('10000000000000'));
      await ganache.setTime(saleStartTime);
      await transfersWrapper.performFewTransfers(amount1, amount2, amount3);

      await ganache.setTime(saleEndTime);
      await prepareDistributions(dexe, 1);

      await ganache.setTime(saleEndTime);
      await dexe.transfer(userOne, userOneTransferBalance2, {
        from: OWNER,
      });
      const launchTime = saleEndTime + 1000;

      await ganache.setTime(launchTime);
      await dexe.launchProduct();

      await ganache.setTime(launchTime + 1000);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(1001051));
      assertBNequal(await dexe.getAverageBalance(transfersWrapper.address), bn(0));

      await ganache.setTime(launchTime + 1000 + MONTH);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(3000000));
      assertBNequal(await dexe.getAverageBalance(transfersWrapper.address), bn(0));

      await ganache.setTime(launchTime + 1000 + MONTH * 2);

      assertBNequal(await dexe.getAverageBalance(userOne), bn(3000000));
      assertBNequal(await dexe.getAverageBalance(transfersWrapper.address), bn(0));
    });
  });
});
