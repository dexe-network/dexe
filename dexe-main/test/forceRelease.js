const Ganache = require('./helpers/ganache');
const truffleAssert = require('truffle-assertions');
const {saleStartTime, saleEndTime} = require('./saleConfig');
const {bn, assertBNequal, prepareDistributions, ForceReleaseType, LockType} = require('./helpers/utils');

const Dexe = artifacts.require('Dexe');
const PriceFeedMock = artifacts.require('PriceFeedMock');
const TokenMock = artifacts.require('TokenMock');


contract('Force release', function(accounts) {
  const ganache = new Ganache(web3);
  afterEach('revert', ganache.revert);

  const ROUND_DURATION_SEC = 86400;
  const FIRST_ROUND_SIZE = bn(1000000);
  const ROUND_SIZE = 190476;
  const USDC_LIMIT_WHITELIST = bn('5000000000000000');
  const userOne = accounts[1];
  const userTwo = accounts[2];

  const TOTAL_SUPPLY = bn(100000000);
  const DEXE = bn(10).pow(bn(18));

  let dexe;
  let usdcToUsdtMock;
  let usdcToEthMock;
  let usdcToDexeMock;

  let tokenUSDCMock;
  let tokenUSDTMock;

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
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await dexe.setUSDTTokenAddress(tokenUSDTMock.address);

    await dexe.addToWhitelist(userOne, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(userTwo, USDC_LIMIT_WHITELIST);

    await ganache.snapshot();
  });

  it('should be possible to force release staking X7 after sale end', async function() {
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
    assertBNequal((await dexe.rounds(1)).totalDeposited, depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo));
    assertBNequal((await dexe.rounds(1)).roundPrice, firstRoundPrice);

    assert.equal(await dexe.balanceOf(userOne), 0);
    await dexe.receiveAll({from: userOne});

    const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);
    assertBNequal(await dexe.balanceOf(userOne), userOneDEXEBalance);

    const userOneStakingLockRoundOne = userOneDEXEBalance.mul(bn(5)).div(bn(100));
    const userOneStakingLock = await dexe.locks(LockType.Staking, userOne);

    assertBNequal((await dexe.holderRounds(1, userOne)).endBalance, userOneDEXEBalance);
    assertBNequal(userOneStakingLock.balance, userOneStakingLockRoundOne);
    assert.equal(userOneStakingLock.released, 0);

    // 2nd round end
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
    const uniswapPriceEndRoundTwo = 10;
    await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);

    const secondRoundPrice = bn(uniswapPriceEndRoundTwo).sub((bn(uniswapPriceEndRoundTwo).mul(bn(10)).div(bn(100))));
    await dexe.prepareDistribution(2);
    assertBNequal((await dexe.rounds(2)).roundPrice, secondRoundPrice);

    await ganache.setTime(saleEndTime);

    await prepareDistributions(dexe);

    assert.equal(await dexe.isRoundDepositsEnded(22), true);


    const userOneStakingLockAllRounds = userOneDEXEBalance.mul(bn(20)).div(bn(100)).mul(bn(20));
    const userOneTenPercentStaking = userOneStakingLockRoundOne.add(userOneStakingLockAllRounds).mul(bn(10)).div(bn(100));

    const userOneX7Commission = userOneTenPercentStaking.mul(bn(14)).div(bn(100));
    const resultingTotalSupply = TOTAL_SUPPLY.sub(bn(ROUND_SIZE * 21)).mul(DEXE);

    await dexe.receiveAll({from: userOne});

    assertBNequal((await dexe.holderRounds(22, userOne)).endBalance, userOneDEXEBalance);
    await usdcToDexeMock.setPrice(secondRoundPrice.mul(bn(7)));

    assertBNequal(
      await dexe.balanceOf(userOne),
      userOneDEXEBalance,
    );

    assertBNequal((await dexe.locks(LockType.Staking, userOne)).balance, userOneStakingLockRoundOne.add(userOneStakingLockAllRounds));
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).released, 0);

    await dexe.forceReleaseStaking(ForceReleaseType.X7, {from: userOne});
    assertBNequal(
      await dexe.totalSupply(),
      resultingTotalSupply.sub(userOneX7Commission),
    );
    assertBNequal(
      await dexe.balanceOf(userOne),
      userOneDEXEBalance.add(userOneTenPercentStaking).sub(userOneX7Commission),
    );
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).released, userOneTenPercentStaking);
  });

  it('should be possible to force release staking X7 after sale end if user did not call receiveAll in the end', async function() {
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

    await dexe.receiveAll({from: userOne});

    const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);

    const userOneStakingLockRoundOne = userOneDEXEBalance.mul(bn(5)).div(bn(100));

    // 2nd round end
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
    const uniswapPriceEndRoundTwo = 10;
    await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);

    const secondRoundPrice = bn(uniswapPriceEndRoundTwo).sub((bn(uniswapPriceEndRoundTwo).mul(bn(10)).div(bn(100))));
    await dexe.prepareDistribution(2);

    await ganache.setTime(saleEndTime);

    await prepareDistributions(dexe);


    const userOneStakingLockAllRounds = userOneDEXEBalance.mul(bn(20)).div(bn(100)).mul(bn(20));
    const userOneTenPercentStaking = userOneStakingLockRoundOne.add(userOneStakingLockAllRounds).mul(bn(10)).div(bn(100));

    const userOneX7Commission = userOneTenPercentStaking.mul(bn(14)).div(bn(100));
    const resultingTotalSupply = TOTAL_SUPPLY.sub(bn(ROUND_SIZE * 21)).mul(DEXE);

    await usdcToDexeMock.setPrice(secondRoundPrice.mul(bn(7)));

    assertBNequal(
      await dexe.balanceOf(userOne),
      userOneDEXEBalance,
    );

    await dexe.forceReleaseStaking(ForceReleaseType.X7, {from: userOne});
    assertBNequal(
      await dexe.totalSupply(),
      resultingTotalSupply.sub(userOneX7Commission),
    );
    assertBNequal(
      await dexe.balanceOf(userOne),
      userOneDEXEBalance.add(userOneTenPercentStaking).sub(userOneX7Commission),
    );
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).released, userOneTenPercentStaking);
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).balance, userOneStakingLockRoundOne.add(userOneStakingLockAllRounds));
  });

  it('should be possible to force release all 4 release types if price increased X20', async function() {
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

    await dexe.receiveAll({from: userOne});

    const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);

    const userOneStakingLockRoundOne = userOneDEXEBalance.mul(bn(5)).div(bn(100));

    // 2nd round end
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
    const uniswapPriceEndRoundTwo = 10;
    await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);

    const secondRoundPrice = bn(uniswapPriceEndRoundTwo).sub((bn(uniswapPriceEndRoundTwo).mul(bn(10)).div(bn(100))));
    await dexe.prepareDistribution(2);

    await ganache.setTime(saleEndTime);

    await prepareDistributions(dexe);

    // X20
    let userOneStakingLockAllRounds = userOneDEXEBalance.mul(bn(20)).div(bn(100)).mul(bn(20)).add(userOneStakingLockRoundOne);
    const userOneThirtyPercentStaking = userOneStakingLockAllRounds.mul(bn(30)).div(bn(100));

    const userOneX20Commission = userOneThirtyPercentStaking.mul(bn(40)).div(bn(100));
    const resultingTotalSupply = TOTAL_SUPPLY.sub(bn(ROUND_SIZE * 21)).mul(DEXE);

    await usdcToDexeMock.setPrice(secondRoundPrice.mul(bn(20)));

    assertBNequal(
      await dexe.balanceOf(userOne),
      userOneDEXEBalance,
    );

    await dexe.forceReleaseStaking(ForceReleaseType.X20, {from: userOne});
    assertBNequal(
      await dexe.totalSupply(),
      resultingTotalSupply.sub(userOneX20Commission),
    );
    assertBNequal(
      await dexe.balanceOf(userOne),
      userOneDEXEBalance.add(userOneThirtyPercentStaking).sub(userOneX20Commission),
    );
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).released, userOneThirtyPercentStaking);


    // X15
    userOneStakingLockAllRounds = userOneStakingLockAllRounds.sub(userOneThirtyPercentStaking);
    const userOneTwentyPercentStaking = userOneStakingLockAllRounds.mul(bn(20)).div(bn(100));

    const userOneX15Commission = userOneTwentyPercentStaking.mul(bn(30)).div(bn(100));

    await dexe.forceReleaseStaking(ForceReleaseType.X15, {from: userOne});
    assertBNequal(
      await dexe.totalSupply(),
      resultingTotalSupply.sub(userOneX20Commission).sub(userOneX15Commission),
    );

    assertBNequal(
      await dexe.balanceOf(userOne),
      userOneDEXEBalance.add(userOneThirtyPercentStaking).sub(userOneX20Commission).add(userOneTwentyPercentStaking).sub(userOneX15Commission),
    );

    assertBNequal((await dexe.locks(LockType.Staking, userOne)).released, userOneThirtyPercentStaking.add(userOneTwentyPercentStaking));

    // X10
    userOneStakingLockAllRounds = userOneStakingLockAllRounds.sub(userOneTwentyPercentStaking);
    const userOneFifteenPercentStaking = userOneStakingLockAllRounds.mul(bn(15)).div(bn(100));

    const userOneX10Commission = userOneFifteenPercentStaking.mul(bn(20)).div(bn(100));

    await dexe.forceReleaseStaking(ForceReleaseType.X10, {from: userOne});
    assertBNequal(
      await dexe.totalSupply(),
      resultingTotalSupply.sub(userOneX20Commission).sub(userOneX15Commission).sub(userOneX10Commission),
    );

    assertBNequal(
      await dexe.balanceOf(userOne),
      userOneDEXEBalance.add(userOneThirtyPercentStaking).sub(userOneX20Commission).add(userOneTwentyPercentStaking).sub(userOneX15Commission)
      .add(userOneFifteenPercentStaking).sub(userOneX10Commission),
    );

    assertBNequal((await dexe.locks(LockType.Staking, userOne)).released, userOneThirtyPercentStaking.add(userOneTwentyPercentStaking)
    .add(userOneFifteenPercentStaking));

    // X7
    userOneStakingLockAllRounds = userOneStakingLockAllRounds.sub(userOneFifteenPercentStaking);
    const userOneTenPercentStaking = userOneStakingLockAllRounds.mul(bn(10)).div(bn(100));

    const userOneX7Commission = userOneTenPercentStaking.mul(bn(14)).div(bn(100));

    await dexe.forceReleaseStaking(ForceReleaseType.X7, {from: userOne});

    assertBNequal(
      await dexe.totalSupply(),
      resultingTotalSupply.sub(userOneX20Commission).sub(userOneX15Commission).sub(userOneX10Commission).sub(userOneX7Commission),
    );

    assertBNequal(
      await dexe.balanceOf(userOne),
      userOneDEXEBalance.add(userOneThirtyPercentStaking).sub(userOneX20Commission).add(userOneTwentyPercentStaking).sub(userOneX15Commission)
      .add(userOneFifteenPercentStaking).sub(userOneX10Commission).add(userOneTenPercentStaking).sub(userOneX7Commission));

    assertBNequal((await dexe.locks(LockType.Staking, userOne)).released, userOneThirtyPercentStaking.add(userOneTwentyPercentStaking)
    .add(userOneFifteenPercentStaking).add(userOneTenPercentStaking));

    assertBNequal((await dexe.holderRounds(23, userOne)).endBalance, 0);
  });

  it('should NOT be possible to force release if token sale round 10 is not reached', async function() {
    await ganache.setTime(saleStartTime);

    await truffleAssert.reverts(dexe.forceReleaseStaking(ForceReleaseType.X7), 'Only after 10 round');
  });

  it('should NOT be possible to force release if token sale did not start yet', async function() {
    await ganache.setTime(saleStartTime - 10);

    await truffleAssert.reverts(dexe.forceReleaseStaking(ForceReleaseType.X7), 'Tokensale not started yet');
  });

  it('should NOT be possible to force release if unknown Force Release type provided', async function() {
    const unknownForceReleaseType = 5;
    const depositAmountUSDCuserOne = bn(1000000);
    const depositAmountUSDCuserTwo = bn(2000000);

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

    await dexe.receiveAll({from: userOne});

    // 2nd round end
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
    const uniswapPriceEndRoundTwo = 10;
    await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);

    const secondRoundPrice = bn(uniswapPriceEndRoundTwo).sub((bn(uniswapPriceEndRoundTwo).mul(bn(10)).div(bn(100))));
    await dexe.prepareDistribution(2);

    await ganache.setTime(saleEndTime);

    await prepareDistributions(dexe);

    await usdcToDexeMock.setPrice(secondRoundPrice.mul(bn(7)));

    await truffleAssert.reverts(
      dexe.forceReleaseStaking(unknownForceReleaseType, {from: userOne}));
  });

  it('should NOT be possible to force release if user did not deposit', async function() {
    await ganache.setTime(saleStartTime);

    await ganache.setTime(saleEndTime);
    assert.equal(await dexe.isRoundDepositsEnded(22), true);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 1);
    await dexe.prepareDistribution(1);

    // 2nd round end
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
    const uniswapPriceEndRoundTwo = 10;
    await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
    await dexe.prepareDistribution(2);

    await ganache.setTime(saleEndTime);

    await prepareDistributions(dexe);

    await usdcToDexeMock.setPrice(bn(uniswapPriceEndRoundTwo).mul(bn(7)));

    await truffleAssert.reverts(dexe.forceReleaseStaking(ForceReleaseType.X7, {from: userOne}), 'Nothing to force unlock');
  });

  it('should NOT be possible to make 2nd force release with same coefficient', async function() {
    const depositAmountUSDCuserOne = bn(1000000);
    const depositAmountUSDCuserTwo = bn(2000000);

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

    await dexe.receiveAll({from: userOne});

    const userOneDEXEBalance = depositAmountUSDCuserOne.mul(DEXE).div(firstRoundPrice);

    // 2nd round end
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
    const uniswapPriceEndRoundTwo = 10;
    await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);

    const secondRoundPrice = bn(uniswapPriceEndRoundTwo).sub((bn(uniswapPriceEndRoundTwo).mul(bn(10)).div(bn(100))));
    await dexe.prepareDistribution(2);

    await ganache.setTime(saleEndTime);

    await prepareDistributions(dexe);

    await usdcToDexeMock.setPrice(secondRoundPrice.mul(bn(7)));

    assertBNequal(
      await dexe.balanceOf(userOne),
      userOneDEXEBalance,
    );

    await dexe.forceReleaseStaking(ForceReleaseType.X7, {from: userOne});
    await truffleAssert.reverts(dexe.forceReleaseStaking(ForceReleaseType.X7, {from: userOne}), 'Already force released');
  });

  it('should NOT be possible to force unlock on round 10', async function() {
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 1);
    await dexe.prepareDistribution(1);

    // 2nd round end
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
    const uniswapPriceEndRoundTwo = 10;
    await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
    await dexe.prepareDistribution(2);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 9 + 1);

    await dexe.prepareDistribution(3);
    await dexe.prepareDistribution(4);
    await dexe.prepareDistribution(5);
    await dexe.prepareDistribution(6);
    await dexe.prepareDistribution(7);
    await dexe.prepareDistribution(8);
    await dexe.prepareDistribution(9);

    await usdcToDexeMock.setPrice(bn(uniswapPriceEndRoundTwo).mul(bn(7)));

    await truffleAssert.reverts(dexe.forceReleaseStaking(ForceReleaseType.X7), 'Only after 10 round');
  });

  it('should NOT be possible to force unlock if price is not increased X7', async function() {
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 1);
    await dexe.prepareDistribution(1);

    // 2nd round end
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
    const uniswapPriceEndRoundTwo = 10;
    await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
    await dexe.prepareDistribution(2);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 10);

    await dexe.prepareDistribution(3);
    await dexe.prepareDistribution(4);
    await dexe.prepareDistribution(5);
    await dexe.prepareDistribution(6);
    await dexe.prepareDistribution(7);
    await dexe.prepareDistribution(8);
    await dexe.prepareDistribution(9);
    await dexe.prepareDistribution(10);

    await usdcToDexeMock.setPrice(bn(uniswapPriceEndRoundTwo).mul(bn(5)));

    await truffleAssert.reverts(dexe.forceReleaseStaking(ForceReleaseType.X7), 'Current price is too small');
  });

  it('should transfer 0 tokens when force release from 1 total lock balance', async function() {
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 1);
    await dexe.prepareDistribution(1);

    // 2nd round end
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
    const uniswapPriceEndRoundTwo = 10;
    await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
    await dexe.prepareDistribution(2);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 10);

    await dexe.prepareDistribution(3);
    await dexe.prepareDistribution(4);
    await dexe.prepareDistribution(5);
    await dexe.prepareDistribution(6);
    await dexe.prepareDistribution(7);
    await dexe.prepareDistribution(8);
    await dexe.prepareDistribution(9);
    await dexe.prepareDistribution(10);

    await usdcToDexeMock.setPrice(bn(uniswapPriceEndRoundTwo).mul(bn(7)));

    await dexe.transferLock(LockType.Staking, userOne, 1);
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).balance, 1);
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).released, 0);
    assertBNequal(
      await dexe.balanceOf(userOne),
      0,
    );
    assertBNequal(
      await dexe.totalSupply(),
      TOTAL_SUPPLY.sub(bn(ROUND_SIZE * 9)).mul(DEXE),
    );

    await dexe.forceReleaseStaking(ForceReleaseType.X7, {from: userOne});
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).balance, 1);
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).released, 0);
    assertBNequal(
      await dexe.balanceOf(userOne),
      0,
    );
    assertBNequal(
      await dexe.totalSupply(),
      TOTAL_SUPPLY.sub(bn(ROUND_SIZE * 9)).mul(DEXE),
    );
  });

  it('should transfer 1 token when force release from 10 total lock balance and no burn because of commission', async function() {
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 1);
    await dexe.prepareDistribution(1);

    // 2nd round end
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
    const uniswapPriceEndRoundTwo = 10;
    await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
    await dexe.prepareDistribution(2);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 10);

    await dexe.prepareDistribution(3);
    await dexe.prepareDistribution(4);
    await dexe.prepareDistribution(5);
    await dexe.prepareDistribution(6);
    await dexe.prepareDistribution(7);
    await dexe.prepareDistribution(8);
    await dexe.prepareDistribution(9);
    await dexe.prepareDistribution(10);

    await usdcToDexeMock.setPrice(bn(uniswapPriceEndRoundTwo).mul(bn(7)));

    await dexe.transferLock(LockType.Staking, userOne, 10);
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).balance, 10);
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).released, 0);
    assertBNequal(
      await dexe.balanceOf(userOne),
      0,
    );
    assertBNequal(
      await dexe.totalSupply(),
      TOTAL_SUPPLY.sub(bn(ROUND_SIZE * 9)).mul(DEXE),
    );

    await dexe.forceReleaseStaking(ForceReleaseType.X7, {from: userOne});

    assertBNequal((await dexe.locks(LockType.Staking, userOne)).balance, 10);
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).released, 1);
    assertBNequal(
      await dexe.balanceOf(userOne),
      0,
    );
    assertBNequal(
      await dexe.totalSupply(),
      TOTAL_SUPPLY.sub(bn(ROUND_SIZE * 9)).mul(DEXE).sub(bn(1)),
    );
  });

  it('should transfer 6 tokens when force release from 71 total lock balance and burn 1 because of commission', async function() {
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 1);
    await dexe.prepareDistribution(1);

    // 2nd round end
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
    const uniswapPriceEndRoundTwo = 10;
    await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
    await dexe.prepareDistribution(2);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 10);

    await dexe.prepareDistribution(3);
    await dexe.prepareDistribution(4);
    await dexe.prepareDistribution(5);
    await dexe.prepareDistribution(6);
    await dexe.prepareDistribution(7);
    await dexe.prepareDistribution(8);
    await dexe.prepareDistribution(9);
    await dexe.prepareDistribution(10);

    await usdcToDexeMock.setPrice(bn(uniswapPriceEndRoundTwo).mul(bn(7)));

    await dexe.transferLock(LockType.Staking, userOne, 71);
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).balance, 71);
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).released, 0);
    assertBNequal(
      await dexe.balanceOf(userOne),
      0,
    );
    assertBNequal(
      await dexe.totalSupply(),
      TOTAL_SUPPLY.sub(bn(ROUND_SIZE * 9)).mul(DEXE),
    );

    await dexe.forceReleaseStaking(ForceReleaseType.X7, {from: userOne});

    assertBNequal((await dexe.locks(LockType.Staking, userOne)).balance, 71);
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).released, 7);
    assertBNequal(
      await dexe.balanceOf(userOne),
      6,
    );
    assertBNequal(
      await dexe.totalSupply(),
      TOTAL_SUPPLY.sub(bn(ROUND_SIZE * 9)).mul(DEXE).sub(bn(1)),
    );
  });

  it('should not increase current round endBalance after sale', async function() {
    // tested in 'should be possible to force release all 4 release types if price increased X20';
  });
});
