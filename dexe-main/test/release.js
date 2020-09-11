const Ganache = require('./helpers/ganache');
const {bn, assertBNequal, prepareDistributions, ForceReleaseType, LockType} = require('./helpers/utils');
const truffleAssert = require('truffle-assertions');
const {saleStartTime, saleEndTime} = require('./saleConfig');

const Dexe = artifacts.require('Dexe');
const PriceFeedMock = artifacts.require('PriceFeedMock');
const TokenMock = artifacts.require('TokenMock');


contract('Release', function(accounts) {
  const ganache = new Ganache(web3);
  afterEach('revert', ganache.revert);

  const saleEnd = saleEndTime - 1;

  const ROUND_DURATION_SEC = 86400;
  const FIRST_ROUND_SIZE = bn(1000000);
  const ROUND_SIZE = 190476;

  const TOTAL_SUPPLY = bn(100000000);
  const DEXE = bn(10).pow(bn(18));
  const USDC_LIMIT_WHITELIST = bn('5000000000000000');
  const owner = accounts[0];
  const userOne = accounts[1];
  const userTwo = accounts[2];
  const userThree = accounts[3];

  const foundationLockAmount = TOTAL_SUPPLY.mul(DEXE).mul(bn(33)).div(bn(100));
  const teamLockAmount = TOTAL_SUPPLY.mul(DEXE).mul(bn(20)).div(bn(100));
  const partnershipLockAmount = TOTAL_SUPPLY.mul(DEXE).mul(bn(16)).div(bn(100));
  const schoolLockAmount = TOTAL_SUPPLY.mul(DEXE).mul(bn(10)).div(bn(100));
  const marketingLockAmount = TOTAL_SUPPLY.mul(DEXE).mul(bn(5)).div(bn(100));
  const liquidityFundAmount = TOTAL_SUPPLY.mul(DEXE).mul(bn(1)).div(bn(100));
  const ownerStartBalance = liquidityFundAmount;

  let dexe;
  let usdcToUsdtMock;
  let usdcToEthMock;
  let usdcToDexeMock;

  let tokenUSDCMock;
  let tokenUSDTMock;

  before('setup others', async function() {
    dexe = await Dexe.new(owner);
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
    await dexe.addToWhitelist(userThree, USDC_LIMIT_WHITELIST);

    await ganache.snapshot();
  });

  it('should not be possible to release if release is not started for different lock types', async function() {
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance,
    );

    await truffleAssert.reverts(dexe.releaseLock(LockType.Staking), 'Releasing has no started yet');
    await truffleAssert.reverts(dexe.releaseLock(LockType.Foundation), 'Releasing has no started yet');
    await truffleAssert.reverts(dexe.releaseLock(LockType.Team), 'Releasing has no started yet');
    await truffleAssert.reverts(dexe.releaseLock(LockType.Partnership), 'Releasing has no started yet');
    await truffleAssert.reverts(dexe.releaseLock(LockType.School), 'Releasing has no started yet');
    await truffleAssert.reverts(dexe.releaseLock(LockType.Marketing), 'Releasing has no started yet');

    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance,
    );
  });

  it('should be possible to release FOUNDATION lock after 10 days of release', async function() {
    const foundationVesting = ROUND_DURATION_SEC * 365 * 4;
    const foundationReleaseStart = saleEnd + ROUND_DURATION_SEC * 365;
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance,
    );

    const timeNow = foundationReleaseStart + ROUND_DURATION_SEC * 10;
    await ganache.setTime(timeNow);

    await dexe.releaseLock(LockType.Foundation);

    const amountToReleaseTenDays = bn(timeNow).sub(bn(foundationReleaseStart)).mul(foundationLockAmount).div(bn(foundationVesting));
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance.add(amountToReleaseTenDays),
    );
  });

  it('should be possible to release All FOUNDATION lock after last vesting second', async function() {
    const foundationVesting = ROUND_DURATION_SEC * 365 * 4;
    const foundationReleaseStart = saleEnd + ROUND_DURATION_SEC * 365;
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance,
    );

    const timeNow = foundationReleaseStart + foundationVesting;
    await ganache.setTime(timeNow);

    await dexe.releaseLock(LockType.Foundation);

    const amountToReleaseAllDays = bn(timeNow).sub(bn(foundationReleaseStart)).mul(foundationLockAmount).div(bn(foundationVesting));
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance.add(amountToReleaseAllDays),
    );
  });

  it('should be possible to release All FOUNDATION lock and not more after the 10 days vesting finish', async function() {
    const foundationVesting = ROUND_DURATION_SEC * 365 * 4;
    const foundationReleaseStart = saleEnd + ROUND_DURATION_SEC * 365;
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance,
    );

    const timeNow = foundationReleaseStart + foundationVesting;
    const afterTenDays = + ROUND_DURATION_SEC * 10;
    await ganache.setTime(timeNow + afterTenDays);

    await dexe.releaseLock(LockType.Foundation);

    const amountToReleaseAfterAllDays = bn(timeNow).sub(bn(foundationReleaseStart)).mul(foundationLockAmount).div(bn(foundationVesting));
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance.add(amountToReleaseAfterAllDays),
    );
  });

  it('should be possible to release TEAM lock after 10 days of release', async function() {
    const teamVesting = ROUND_DURATION_SEC * 365 * 2;
    const teamReleaseStart = saleEnd + ROUND_DURATION_SEC * 180;
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance,
    );

    const timeNow = teamReleaseStart + ROUND_DURATION_SEC * 10;
    await ganache.setTime(timeNow);

    await dexe.releaseLock(LockType.Team);

    const amountToReleaseTenDays = bn(timeNow).sub(bn(teamReleaseStart)).mul(teamLockAmount).div(bn(teamVesting));
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance.add(amountToReleaseTenDays),
    );
  });

  it('should be possible to release All TEAM lock after last vesting second', async function() {
    const teamVesting = ROUND_DURATION_SEC * 365 * 2;
    const teamReleaseStart = saleEnd + ROUND_DURATION_SEC * 180;
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance,
    );

    const timeNow = teamReleaseStart + teamVesting;
    await ganache.setTime(timeNow);

    await dexe.releaseLock(LockType.Team);

    const amountToReleaseAllDays = bn(timeNow).sub(bn(teamReleaseStart)).mul(teamLockAmount).div(bn(teamVesting));
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance.add(amountToReleaseAllDays),
    );
  });

  it('should be possible to release All TEAM lock and not more after the 10 days vesting finish', async function() {
    const teamVesting = ROUND_DURATION_SEC * 365 * 2;
    const teamReleaseStart = saleEnd + ROUND_DURATION_SEC * 180;
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance,
    );

    const timeNow = teamReleaseStart + teamVesting;
    const afterTenDays = + ROUND_DURATION_SEC * 10;
    await ganache.setTime(timeNow + afterTenDays);

    await dexe.releaseLock(LockType.Team);

    const amountToReleaseAfterAllDays = bn(timeNow).sub(bn(teamReleaseStart)).mul(teamLockAmount).div(bn(teamVesting));
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance.add(amountToReleaseAfterAllDays),
    );
  });

  it('should be possible to release All PARTNERSHIP lock after last vesting second', async function() {
    const partnershipVesting = ROUND_DURATION_SEC * 365;
    const partnershipReleaseStart = saleEnd + ROUND_DURATION_SEC * 90;
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance,
    );

    const timeNow = partnershipReleaseStart + partnershipVesting;
    await ganache.setTime(timeNow);

    await dexe.releaseLock(LockType.Partnership);

    const amountToReleaseAllDays = bn(timeNow).sub(bn(partnershipReleaseStart)).mul(partnershipLockAmount).div(bn(partnershipVesting));
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance.add(amountToReleaseAllDays),
    );
  });

  it('should be possible to release All PARTNERSHIP lock and not more after the 10 days vesting finish', async function() {
    const partnershipVesting = ROUND_DURATION_SEC * 365;
    const partnershipReleaseStart = saleEnd + ROUND_DURATION_SEC * 90;
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance,
    );

    const timeNow = partnershipReleaseStart + partnershipVesting;
    const afterTenDays = + ROUND_DURATION_SEC * 10;
    await ganache.setTime(timeNow + afterTenDays);

    await dexe.releaseLock(LockType.Partnership);

    const amountToReleaseAfterAllDays = bn(timeNow).sub(bn(partnershipReleaseStart)).mul(partnershipLockAmount).div(bn(partnershipVesting));
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance.add(amountToReleaseAfterAllDays),
    );
  });

  it('should be possible to release SCHOOL lock after 10 days of release', async function() {
    const schoolVesting = ROUND_DURATION_SEC * 365;
    const schoolReleaseStart = saleEnd + ROUND_DURATION_SEC * 60;
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance,
    );

    const timeNow = schoolReleaseStart + ROUND_DURATION_SEC * 10;
    await ganache.setTime(timeNow);

    await dexe.releaseLock(LockType.School);

    const amountToReleaseTenDays = bn(timeNow).sub(bn(schoolReleaseStart)).mul(schoolLockAmount).div(bn(schoolVesting));
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance.add(amountToReleaseTenDays),
    );
  });

  it('should be possible to release All SCHOOL lock after last vesting second', async function() {
    const schoolVesting = ROUND_DURATION_SEC * 365;
    const schoolReleaseStart = saleEnd + ROUND_DURATION_SEC * 60;
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance,
    );

    const timeNow = schoolReleaseStart + schoolVesting;
    await ganache.setTime(timeNow);

    await dexe.releaseLock(LockType.School);

    const amountToReleaseAllDays = bn(timeNow).sub(bn(schoolReleaseStart)).mul(schoolLockAmount).div(bn(schoolVesting));
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance.add(amountToReleaseAllDays),
    );
  });

  it('should be possible to release All SCHOOL lock and not more after the 10 days vesting finish', async function() {
    const schoolVesting = ROUND_DURATION_SEC * 365;
    const schoolReleaseStart = saleEnd + ROUND_DURATION_SEC * 60;
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance,
    );

    const timeNow = schoolReleaseStart + schoolVesting;
    const afterTenDays = + ROUND_DURATION_SEC * 10;
    await ganache.setTime(timeNow + afterTenDays);

    await dexe.releaseLock(LockType.School);

    const amountToReleaseAfterAllDays = bn(timeNow).sub(bn(schoolReleaseStart)).mul(schoolLockAmount).div(bn(schoolVesting));
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance.add(amountToReleaseAfterAllDays),
    );
  });

  it('should be possible to release MARKETING lock after 10 days of release', async function() {
    const marketingVesting = ROUND_DURATION_SEC * 365;
    const marketingReleaseStart = saleEnd + ROUND_DURATION_SEC * 30;
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance,
    );

    const timeNow = marketingReleaseStart + ROUND_DURATION_SEC * 10;
    await ganache.setTime(timeNow);

    await dexe.releaseLock(LockType.Marketing);

    const amountToReleaseTenDays = bn(timeNow).sub(bn(marketingReleaseStart)).mul(marketingLockAmount).div(bn(marketingVesting));
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance.add(amountToReleaseTenDays),
    );
  });

  it('should be possible to release All MARKETING lock after last vesting second', async function() {
    const marketingVesting = ROUND_DURATION_SEC * 365;
    const marketingReleaseStart = saleEnd + ROUND_DURATION_SEC * 30;
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance,
    );

    const timeNow = marketingReleaseStart + marketingVesting;
    await ganache.setTime(timeNow);

    await dexe.releaseLock(LockType.Marketing);

    const amountToReleaseAllDays = bn(timeNow).sub(bn(marketingReleaseStart)).mul(marketingLockAmount).div(bn(marketingVesting));
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance.add(amountToReleaseAllDays),
    );
  });

  it('should be possible to release All MARKETING lock and not more after the 10 days vesting finish', async function() {
    const marketingVesting = ROUND_DURATION_SEC * 365;
    const marketingReleaseStart = saleEnd + ROUND_DURATION_SEC * 30;
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance,
    );

    const timeNow = marketingReleaseStart + marketingVesting;
    const afterTenDays = + ROUND_DURATION_SEC * 10;
    await ganache.setTime(timeNow + afterTenDays);

    await dexe.releaseLock(LockType.Marketing);

    const amountToReleaseAfterAllDays = bn(timeNow).sub(bn(marketingReleaseStart)).mul(marketingLockAmount).div(bn(marketingVesting));
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance.add(amountToReleaseAfterAllDays),
    );
  });

  it('should not be possible to release if all lock already released', async function() {
    const marketingVesting = ROUND_DURATION_SEC * 365;
    const marketingReleaseStart = saleEnd + ROUND_DURATION_SEC * 30;
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance,
    );

    const timeNow = marketingReleaseStart + marketingVesting;
    await ganache.setTime(timeNow);

    await dexe.releaseLock(LockType.Marketing);

    const amountToReleaseAllDays = bn(timeNow).sub(bn(marketingReleaseStart)).mul(marketingLockAmount).div(bn(marketingVesting));
    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance.add(amountToReleaseAllDays),
    );

    await ganache.setTime(timeNow + ROUND_DURATION_SEC * 30);
    await truffleAssert.reverts(dexe.releaseLock(LockType.Marketing), 'Insufficient unlocked');

    assertBNequal(
      await dexe.balanceOf(owner),
      ownerStartBalance.add(amountToReleaseAllDays),
    );
  });

  it('should not be possible to release for user that does not have lock funds', async function() {
    const unknownUser = accounts[5];
    const marketingVesting = ROUND_DURATION_SEC * 365;

    await ganache.setTime(saleEnd + ROUND_DURATION_SEC * 30 + marketingVesting + ROUND_DURATION_SEC * 30);
    await truffleAssert.reverts(dexe.releaseLock(LockType.Marketing, {from: unknownUser}), 'Insufficient unlocked');

    assertBNequal(
      await dexe.balanceOf(unknownUser),
      0,
    );
  });

  it('should be possible to release STAKING lock after 10 days of release', async function() {
    const depositAmountUSDCuserOne = bn(4000000);
    const depositAmountUSDCuserTwo = bn(6000000);
    const depositAmountUSDCuserThree = bn(40000000);

    const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).add(depositAmountUSDCuserThree).div(FIRST_ROUND_SIZE);

    await ganache.setTime(saleStartTime);

    await dexe.depositUSDC(depositAmountUSDCuserOne, {
      from: userOne,
    });
    await dexe.depositUSDC(depositAmountUSDCuserTwo, {
      from: userTwo,
    });
    await dexe.depositUSDC(depositAmountUSDCuserThree, {
      from: userThree,
    });
    // 1st round end
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
    await dexe.prepareDistribution(1);
    assertBNequal((await dexe.rounds(1)).totalDeposited,
      depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).add(depositAmountUSDCuserThree));
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

    await dexe.receiveAll({from: userOne});

    assertBNequal((await dexe.holderRounds(22, userOne)).endBalance, userOneDEXEBalance);
    await usdcToDexeMock.setPrice(secondRoundPrice.mul(bn(7)));

    assertBNequal(
      await dexe.balanceOf(userOne),
      userOneDEXEBalance,
    );

    assertBNequal((await dexe.locks(LockType.Staking, userOne)).balance, userOneStakingLockRoundOne.add(userOneStakingLockAllRounds));

    const userOneStakingLockSaleEnd = userOneStakingLockRoundOne.add(userOneStakingLockAllRounds);

    const stakingVesting = ROUND_DURATION_SEC * 365;
    const stakingReleaseStart = saleEnd;

    const timeNow = stakingReleaseStart + ROUND_DURATION_SEC * 10;
    await ganache.setTime(timeNow);

    const amountToReleaseTenDays = bn(timeNow).sub(bn(stakingReleaseStart)).mul(userOneStakingLockSaleEnd).div(bn(stakingVesting));

    const amountToReleaseAllDays = bn(stakingReleaseStart + stakingVesting).sub(bn(saleEnd)).mul(userOneStakingLockSaleEnd).div(bn(stakingVesting));

    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).balance,
      amountToReleaseAllDays,
    );


    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).released,
      0,
    );

    await ganache.setTime(timeNow);
    await dexe.releaseLock(LockType.Staking, {from: userOne});

    assertBNequal(
      await dexe.balanceOf(userOne),
      userOneDEXEBalance.add(amountToReleaseTenDays),
    );

    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).balance,
      amountToReleaseAllDays,
    );

    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).released,
      amountToReleaseTenDays,
    );
  });

  it('should be possible to release All STAKING lock after last vesting second', async function() {
    const depositAmountUSDCuserOne = bn(5000000);
    const depositAmountUSDCuserTwo = bn(2000000);
    const depositAmountUSDCuserThree = bn(40000000);

    const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).add(depositAmountUSDCuserThree).div(FIRST_ROUND_SIZE);

    await ganache.setTime(saleStartTime);

    await dexe.depositUSDC(depositAmountUSDCuserOne, {
      from: userOne,
    });
    await dexe.depositUSDC(depositAmountUSDCuserTwo, {
      from: userTwo,
    });
    await dexe.depositUSDC(depositAmountUSDCuserThree, {
      from: userThree,
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

    assert.equal(await dexe.isRoundDepositsEnded(22), true);


    const userOneStakingLockAllRounds = userOneDEXEBalance.mul(bn(20)).div(bn(100)).mul(bn(20));

    await dexe.receiveAll({from: userOne});

    await usdcToDexeMock.setPrice(secondRoundPrice.mul(bn(7)));

    assertBNequal(
      await dexe.balanceOf(userOne),
      userOneDEXEBalance,
    );

    assertBNequal((await dexe.locks(LockType.Staking, userOne)).balance, userOneStakingLockRoundOne.add(userOneStakingLockAllRounds));

    const userOneStakingLockSaleEnd = userOneStakingLockRoundOne.add(userOneStakingLockAllRounds);

    const stakingVesting = ROUND_DURATION_SEC * 365;
    const stakingReleaseStart = saleEnd;

    const timeNow = stakingReleaseStart + stakingVesting;
    await ganache.setTime(timeNow);

    const amountToReleaseAllDays = bn(timeNow).sub(bn(stakingReleaseStart)).mul(userOneStakingLockSaleEnd).div(bn(stakingVesting));

    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).balance,
      amountToReleaseAllDays,
    );

    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).released,
      0,
    );

    await ganache.setTime(timeNow);
    await dexe.releaseLock(LockType.Staking, {from: userOne});

    assertBNequal(
      await dexe.balanceOf(userOne),
      userOneDEXEBalance.add(amountToReleaseAllDays),
    );

    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).balance,
      amountToReleaseAllDays,
    );

    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).released,
      amountToReleaseAllDays,
    );
  });

  it('should be possible to release All STAKING lock and not more after the 10 days vesting finish', async function() {
    const depositAmountUSDCuserOne = bn(5000000);
    const depositAmountUSDCuserTwo = bn(2000000);
    const depositAmountUSDCuserThree = bn(40000000);

    const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).add(depositAmountUSDCuserThree).div(FIRST_ROUND_SIZE);

    await ganache.setTime(saleStartTime);

    await dexe.depositUSDC(depositAmountUSDCuserOne, {
      from: userOne,
    });
    await dexe.depositUSDC(depositAmountUSDCuserTwo, {
      from: userTwo,
    });
    await dexe.depositUSDC(depositAmountUSDCuserThree, {
      from: userThree,
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

    assert.equal(await dexe.isRoundDepositsEnded(22), true);


    const userOneStakingLockAllRounds = userOneDEXEBalance.mul(bn(20)).div(bn(100)).mul(bn(20));

    await dexe.receiveAll({from: userOne});

    await usdcToDexeMock.setPrice(secondRoundPrice.mul(bn(7)));

    assertBNequal(
      await dexe.balanceOf(userOne),
      userOneDEXEBalance,
    );

    assertBNequal((await dexe.locks(LockType.Staking, userOne)).balance, userOneStakingLockRoundOne.add(userOneStakingLockAllRounds));

    const userOneStakingLockSaleEnd = userOneStakingLockRoundOne.add(userOneStakingLockAllRounds);

    const stakingVesting = ROUND_DURATION_SEC * 365;
    const stakingReleaseStart = saleEnd;

    const timeNow = stakingReleaseStart + stakingVesting;
    const afterTenDays = + ROUND_DURATION_SEC * 10;
    await ganache.setTime(timeNow + afterTenDays);

    const amountToReleaseAllDays = bn(timeNow).sub(bn(stakingReleaseStart)).mul(userOneStakingLockSaleEnd).div(bn(stakingVesting));

    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).balance,
      amountToReleaseAllDays,
    );

    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).released,
      0,
    );

    await ganache.setTime(timeNow + afterTenDays);
    await dexe.releaseLock(LockType.Staking, {from: userOne});

    assertBNequal(
      await dexe.balanceOf(userOne),
      userOneDEXEBalance.add(amountToReleaseAllDays),
    );

    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).balance,
      amountToReleaseAllDays,
    );

    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).released,
      amountToReleaseAllDays,
    );
  });

  it('should NOT be possible to release STAKING lock after 10 days of release if user did Force release (with X7 price)', async function() {
    const depositAmountUSDCuserOne = bn(4000000);
    const depositAmountUSDCuserTwo = bn(6000000);
    const depositAmountUSDCuserThree = bn(40000000);

    const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).add(depositAmountUSDCuserThree).div(FIRST_ROUND_SIZE);

    await ganache.setTime(saleStartTime);

    await dexe.depositUSDC(depositAmountUSDCuserOne, {
      from: userOne,
    });
    await dexe.depositUSDC(depositAmountUSDCuserTwo, {
      from: userTwo,
    });
    await dexe.depositUSDC(depositAmountUSDCuserThree, {
      from: userThree,
    });
    // 1st round end
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
    await dexe.prepareDistribution(1);
    assertBNequal((await dexe.rounds(1)).totalDeposited,
      depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).add(depositAmountUSDCuserThree));
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

    const stakingReleaseStart = saleEnd;

    const timeNow = stakingReleaseStart + ROUND_DURATION_SEC * 10;
    await ganache.setTime(timeNow);

    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).balance,
      userOneStakingLockRoundOne.add(userOneStakingLockAllRounds),
    );

    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).released,
      userOneTenPercentStaking,
    );

    await ganache.setTime(timeNow);
    await truffleAssert.reverts(dexe.releaseLock(LockType.Staking, {from: userOne}), 'Insufficient unlocked');
  });

  it('should be possible to release all lock STAKING left after vesting period if user did Force release (with X7 price)', async function() {
    const depositAmountUSDCuserOne = bn(4000000);
    const depositAmountUSDCuserTwo = bn(6000000);
    const depositAmountUSDCuserThree = bn(40000000);

    const firstRoundPrice = depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).add(depositAmountUSDCuserThree).div(FIRST_ROUND_SIZE);

    await ganache.setTime(saleStartTime);

    await dexe.depositUSDC(depositAmountUSDCuserOne, {
      from: userOne,
    });
    await dexe.depositUSDC(depositAmountUSDCuserTwo, {
      from: userTwo,
    });
    await dexe.depositUSDC(depositAmountUSDCuserThree, {
      from: userThree,
    });
    // 1st round end
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC);
    await dexe.prepareDistribution(1);
    assertBNequal((await dexe.rounds(1)).totalDeposited,
      depositAmountUSDCuserOne.add(depositAmountUSDCuserTwo).add(depositAmountUSDCuserThree));
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

    const stakingReleaseStart = saleEnd;

    const userOneStakingLockSaleEnd = userOneStakingLockRoundOne.add(userOneStakingLockAllRounds);
    const stakingVesting = ROUND_DURATION_SEC * 365;
    const timeNow = stakingReleaseStart + stakingVesting;
    const afterTenDays = + ROUND_DURATION_SEC * 10;
    await ganache.setTime(timeNow + afterTenDays);

    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).balance,
      userOneStakingLockRoundOne.add(userOneStakingLockAllRounds),
    );

    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).released,
      userOneTenPercentStaking,
    );

    await ganache.setTime(timeNow + afterTenDays);
    await dexe.releaseLock(LockType.Staking, {from: userOne});

    const amountToReleaseAllDays = bn(timeNow).sub(bn(stakingReleaseStart)).mul(userOneStakingLockSaleEnd).div(bn(stakingVesting));

    assertBNequal(
      await dexe.balanceOf(userOne),
      userOneDEXEBalance.add(amountToReleaseAllDays).sub(userOneX7Commission),
    );

    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).balance,
      amountToReleaseAllDays,
    );

    assertBNequal(
      (await dexe.locks(LockType.Staking, userOne)).released,
      amountToReleaseAllDays,
    );
  });

  it('should NOT be possible to release 1 micro token from release only if vesting is in progress', async function() {
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 1);
    await dexe.prepareDistribution(1);

    // 2nd round end
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
    const uniswapPriceEndRoundTwo = 10;
    await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
    await dexe.prepareDistribution(2);

    const stakingReleaseStart = saleEnd;
    const timeNow = stakingReleaseStart + ROUND_DURATION_SEC * 10;
    await ganache.setTime(timeNow);

    await prepareDistributions(dexe);

    await usdcToDexeMock.setPrice(bn(uniswapPriceEndRoundTwo).mul(bn(7)));

    await dexe.receiveAll();

    await dexe.transferLock(LockType.Staking, userOne, 1);
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).balance, 1);
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).released, 0);
    assertBNequal(
      await dexe.balanceOf(userOne),
      0,
    );

    await ganache.setTime(timeNow);
    await truffleAssert.reverts(dexe.releaseLock(LockType.Staking, {from: userOne}), 'Insufficient unlocked');
  });

  it('should NOT be possible to release 1 micro token from release only when vesting is done', async function() {
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC + 1);
    await dexe.prepareDistribution(1);

    // 2nd round end
    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2);
    const uniswapPriceEndRoundTwo = 10;
    await usdcToDexeMock.setPrice(uniswapPriceEndRoundTwo);
    await dexe.prepareDistribution(2);

    const stakingReleaseStart = saleEnd;
    const stakingVesting = ROUND_DURATION_SEC * 365;
    const timeNow = stakingReleaseStart + stakingVesting;
    await ganache.setTime(timeNow);

    await prepareDistributions(dexe);

    await usdcToDexeMock.setPrice(bn(uniswapPriceEndRoundTwo).mul(bn(7)));

    await dexe.receiveAll();

    await dexe.transferLock(LockType.Staking, userOne, 1);
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).balance, 1);
    assertBNequal((await dexe.locks(LockType.Staking, userOne)).released, 0);
    assertBNequal(
      await dexe.balanceOf(userOne),
      0,
    );

    await ganache.setTime(timeNow);
    await dexe.releaseLock(LockType.Staking, {from: userOne});

    assertBNequal((await dexe.locks(LockType.Staking, userOne)).released, 1);
    assertBNequal(
      await dexe.balanceOf(userOne),
      1,
    );
  });
});
