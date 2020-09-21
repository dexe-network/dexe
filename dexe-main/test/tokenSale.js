const Ganache = require('./helpers/ganache');
const truffleAssert = require('truffle-assertions');
const {saleStartTime, saleEndTime, depositsEndTime} = require('./saleConfig');
const {bn, tokenAsserts, HolderRoundStatus, assertBNequal} = require('./helpers/utils');

const Dexe = artifacts.require('Dexe');
const PriceFeedMock = artifacts.require('PriceFeedMock');
const TokenMock = artifacts.require('TokenMock');

contract('Tokensale', function(accounts) {
  const ganache = new Ganache(web3);
  afterEach('revert', ganache.revert);

  const DAY = 86400;
  const DAYS = DAY;
  const DEXE = bn(10).pow(bn(18));
  const OWNER_BALANCE = bn(1000000).mul(DEXE);
  const FIRST_ROUND_SIZE_BASE = bn(1000000);
  const ROUND_SIZE_BASE = bn(190476);
  const USDC = bn(1000000);
  const USDT = bn(1000000);
  const ETH = bn(10).pow(bn(18));
  const USDC_LIMIT_WHITELIST = bn('5000000000000000');

  const BEFORE_SALE = saleStartTime - 100;
  const ROUND_1 = saleStartTime + 1;
  const ROUND_2 = saleStartTime + DAY + 1;
  const ROUND_22 = saleStartTime + 21 * DAYS + 1;
  const AFTER_SALE = saleEndTime + 1;
  const AFTER_LAUNCH = saleEndTime + 30 * DAYS + 1;

  const owner = accounts[0];
  const user1 = accounts[1];
  const user3 = accounts[3];

  const OWNER = 0;
  const userOne = 1;
  const userTwo = 2;
  const userThree = 3;

  let dexe;
  let usdcToUsdtMock;
  let usdcToEthMock;

  let tokenUSDCMock;
  let tokenUSDTMock;

  let assertBalance;
  let assertHolderRound;
  let assertUserInfo;
  let stateChecker;

  const prepareDistributions = async (startFromRound = 1, endRound = 22) => {
    for (let i = startFromRound; i <= endRound; i++) {
      await dexe.prepareDistribution(i);
    }
  };

  before('setup others', async function() {
    dexe = await Dexe.new(owner);
    usdcToUsdtMock = await PriceFeedMock.new();
    usdcToEthMock = await PriceFeedMock.new();
    usdcToDexeMock = await PriceFeedMock.new();

    tokenUSDCMock = await TokenMock.new();
    tokenUSDTMock = await TokenMock.new();

    const helpers = tokenAsserts(dexe, accounts);
    assertBalance = helpers.assertBalance;
    assertHolderRound = helpers.assertHolderRound;
    assertUserInfo = helpers.assertUserInfo;
    stateChecker = helpers.stateChecker;

    await ganache.snapshot();
  });

  it('should not set treasury to 0x0', async function() {
    await truffleAssert.reverts(dexe.setTreasury('0x0000000000000000000000000000000000000000'), 'Not zero address required');
  });

  it('should not deposit less than 1 USDC', async function() {
    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await ganache.setTime(saleStartTime);
    await truffleAssert.reverts(dexe.depositUSDC(0, {from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositUSDC(1, {from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositUSDC(USDC.sub(bn(1)), {from: user1}), 'Less than minimum amount 1 usdc');
  });
  it('should not deposit less than 1 USDC in USDT', async function() {
    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.setUSDTTokenAddress(tokenUSDTMock.address);
    await dexe.setUSDTFeed(usdcToUsdtMock.address);
    await ganache.setTime(saleStartTime);
    await usdcToUsdtMock.setPrice(USDC);
    await truffleAssert.reverts(dexe.depositUSDT(0, {from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositUSDT(1, {from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositUSDT(USDC.sub(bn(1)), {from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToUsdtMock.setPrice(USDC.mul(bn(2)));
    await truffleAssert.reverts(dexe.depositUSDT(0, {from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositUSDT(1, {from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositUSDT(USDC.div(bn(2)).sub(bn(1)), {from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToUsdtMock.setPrice(USDC.div(bn(2)));
    await truffleAssert.reverts(dexe.depositUSDT(0, {from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositUSDT(1, {from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositUSDT(USDC.mul(bn(2)).sub(bn(1)), {from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToUsdtMock.setPrice(bn(1));
    await truffleAssert.reverts(dexe.depositUSDT(0, {from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositUSDT(1, {from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositUSDT(USDC, {from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositUSDT(USDC.mul(USDC).sub(bn(1)), {from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToUsdtMock.setPrice(bn(2));
    await truffleAssert.reverts(dexe.depositUSDT(0, {from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositUSDT(1, {from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositUSDT(USDC, {from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositUSDT(USDC.mul(USDC).div(bn(2)).sub(bn(1)), {from: user1}), 'Less than minimum amount 1 usdc');
  });
  it('should not deposit less than 1 USDC in ETH', async function() {
    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.setETHFeed(usdcToEthMock.address);
    await ganache.setTime(saleStartTime);
    await usdcToEthMock.setPrice(USDC);
    await truffleAssert.reverts(dexe.depositETH({value: 0, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: 1, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: USDC.sub(bn(1)), from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToEthMock.setPrice(USDC.mul(bn(2)));
    await truffleAssert.reverts(dexe.depositETH({value: 0, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: 1, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: USDC.div(bn(2)).sub(bn(1)), from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToEthMock.setPrice(USDC.div(bn(2)));
    await truffleAssert.reverts(dexe.depositETH({value: 0, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: 1, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: USDC.mul(bn(2)).sub(bn(1)), from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToEthMock.setPrice(bn(1));
    await truffleAssert.reverts(dexe.depositETH({value: 0, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: 1, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: USDC, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: USDC.mul(USDC).sub(bn(1)), from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToEthMock.setPrice(bn(2));
    await truffleAssert.reverts(dexe.depositETH({value: 0, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: 1, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: USDC, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(
      dexe.depositETH({value: USDC.mul(USDC).div(bn(2)).sub(bn(1)), from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToEthMock.setPrice(USDC.mul(bn(400)));
    await truffleAssert.reverts(dexe.depositETH({value: 0, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: 1, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: USDC, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: ETH.div(bn(400)).sub(bn(1)), from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToEthMock.setPrice(USDC.mul(bn(10)));
    await truffleAssert.reverts(dexe.depositETH({value: 0, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: 1, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: USDC, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: ETH.div(bn(10)).sub(bn(1)), from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToEthMock.setPrice(USDC.mul(bn(1000)));
    await truffleAssert.reverts(dexe.depositETH({value: 0, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: 1, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH({value: USDC, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.depositETH(
      {value: ETH.div(bn(1000)).sub(bn(1)), from: user1}), 'Less than minimum amount 1 usdc');
  });
  it('should not deposit less than 1 USDC in ETH through receive', async function() {
    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.setETHFeed(usdcToEthMock.address);
    await ganache.setTime(saleStartTime);
    await usdcToEthMock.setPrice(USDC);
    await truffleAssert.reverts(dexe.sendTransaction({value: 0, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: 1, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: USDC.sub(bn(1)), from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToEthMock.setPrice(USDC.mul(bn(2)));
    await truffleAssert.reverts(dexe.sendTransaction({value: 0, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: 1, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: USDC.div(bn(2)).sub(bn(1)), from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToEthMock.setPrice(USDC.div(bn(2)));
    await truffleAssert.reverts(dexe.sendTransaction({value: 0, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: 1, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: USDC.mul(bn(2)).sub(bn(1)), from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToEthMock.setPrice(bn(1));
    await truffleAssert.reverts(dexe.sendTransaction({value: 0, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: 1, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: USDC, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: USDC.mul(USDC).sub(bn(1)), from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToEthMock.setPrice(bn(2));
    await truffleAssert.reverts(dexe.sendTransaction({value: 0, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: 1, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: USDC, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(
      dexe.sendTransaction({value: USDC.mul(USDC).div(bn(2)).sub(bn(1)), from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToEthMock.setPrice(USDC.mul(bn(400)));
    await truffleAssert.reverts(dexe.sendTransaction({value: 0, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: 1, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: USDC, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: ETH.div(bn(400)).sub(bn(1)), from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToEthMock.setPrice(USDC.mul(bn(10)));
    await truffleAssert.reverts(dexe.sendTransaction({value: 0, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: 1, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: USDC, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: ETH.div(bn(10)).sub(bn(1)), from: user1}), 'Less than minimum amount 1 usdc');

    await usdcToEthMock.setPrice(USDC.mul(bn(1000)));
    await truffleAssert.reverts(dexe.sendTransaction({value: 0, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: 1, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(dexe.sendTransaction({value: USDC, from: user1}), 'Less than minimum amount 1 usdc');
    await truffleAssert.reverts(
      dexe.sendTransaction({value: ETH.div(bn(1000)).sub(bn(1)), from: user1}), 'Less than minimum amount 1 usdc');
  });
  it('should not deposit before tokensale start', async function() {
    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await dexe.setUSDTTokenAddress(tokenUSDTMock.address);
    await dexe.setETHFeed(usdcToEthMock.address);
    await dexe.setUSDTFeed(usdcToUsdtMock.address);
    await ganache.setTime(saleStartTime - 10);
    await truffleAssert.reverts(dexe.depositUSDC(USDC, {from: user1}), 'Tokensale not started yet');
    await truffleAssert.reverts(dexe.depositUSDT(USDC, {from: user1}), 'Tokensale not started yet');
    await truffleAssert.reverts(dexe.depositETH({value: ETH, from: user1}), 'Tokensale not started yet');
    await truffleAssert.reverts(dexe.sendTransaction({value: ETH, from: user1}), 'Tokensale not started yet');
  });
  it('should not deposit after deposits end', async function() {
    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await dexe.setUSDTTokenAddress(tokenUSDTMock.address);
    await dexe.setETHFeed(usdcToEthMock.address);
    await dexe.setUSDTFeed(usdcToUsdtMock.address);
    await ganache.setTime(depositsEndTime);
    await truffleAssert.reverts(dexe.depositUSDC(USDC, {from: user1}), 'Deposits ended');
    await truffleAssert.reverts(dexe.depositUSDT(USDC, {from: user1}), 'Deposits ended');
    await truffleAssert.reverts(dexe.depositETH({value: ETH, from: user1}), 'Deposits ended');
    await truffleAssert.reverts(dexe.sendTransaction({value: ETH, from: user1}), 'Deposits ended');
    await ganache.setTime(saleEndTime);
    await truffleAssert.reverts(dexe.depositUSDC(USDC, {from: user1}), 'Deposits ended');
    await truffleAssert.reverts(dexe.depositUSDT(USDC, {from: user1}), 'Deposits ended');
    await truffleAssert.reverts(dexe.depositETH({value: ETH, from: user1}), 'Deposits ended');
    await truffleAssert.reverts(dexe.sendTransaction({value: ETH, from: user1}), 'Deposits ended');
  });
  it('should not deposit USDC if transfer failed', async function() {
    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.setETHFeed(usdcToEthMock.address);
    await dexe.setUSDTFeed(usdcToUsdtMock.address);
    await dexe.setUSDTTokenAddress(tokenUSDTMock.address);
    await ganache.setTime(saleStartTime);
    await truffleAssert.reverts(dexe.depositUSDC(USDC, {from: user1}));
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await tokenUSDCMock.shouldFail();
    await truffleAssert.reverts(dexe.depositUSDC(USDC, {from: user1}));
  });
  it('should not deposit USDT if transfer failed', async function() {
    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.setETHFeed(usdcToEthMock.address);
    await dexe.setUSDTFeed(usdcToUsdtMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await ganache.setTime(saleStartTime);
    await truffleAssert.reverts(dexe.depositUSDT(USDC, {from: user1}));
    await dexe.setUSDTTokenAddress(tokenUSDTMock.address);
    await tokenUSDTMock.shouldFail();
    await truffleAssert.reverts(dexe.depositUSDT(USDC, {from: user1}));
  });
  it('should not deposit ETH if transfer failed', async function() {
    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.setETHFeed(usdcToEthMock.address);
    await dexe.setTreasury(usdcToEthMock.address);
    await ganache.setTime(saleStartTime);
    await truffleAssert.reverts(dexe.depositETH({value: ETH, from: user1}));
  });
  it('should not deposit ETH through receive if transfer failed', async function() {
    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.setETHFeed(usdcToEthMock.address);
    await dexe.setTreasury(usdcToEthMock.address);
    await ganache.setTime(saleStartTime);
    await truffleAssert.reverts(dexe.sendTransaction({value: ETH, from: user1}));
  });
  it('should not deposit USDC in round 1 if not whitelisted', async function() {
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await ganache.setTime(saleStartTime);
    await truffleAssert.reverts(dexe.depositUSDC(USDC, {from: user1}), 'Not whitelisted');
  });
  it('should not deposit USDC in round 1 if deposit amount is more than limit', async function() {
    const limit = USDC;
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await ganache.setTime(saleStartTime);
    await dexe.addToWhitelist(user1, limit);
    await truffleAssert.reverts(dexe.depositUSDC(USDC.add(bn(10)), {from: user1}), 'Deposit limit is reached');
  });
  it('should not deposit USDC in round 1 if sum of 2nd deposit with 1st deposit is more than limit', async function() {
    const limit = USDC.mul(bn(2));
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await ganache.setTime(saleStartTime);
    await dexe.addToWhitelist(user1, limit);
    await dexe.depositUSDC(limit.div(bn(2)), {from: user1});
    await truffleAssert.reverts(dexe.depositUSDC(limit.div(bn(2)).add(bn(1)), {from: user1}), 'Deposit limit is reached');
  });
  it('should not deposit USDT in round 1 if not whitelisted', async function() {
    await dexe.setUSDTTokenAddress(tokenUSDTMock.address);
    await dexe.setUSDTFeed(usdcToUsdtMock.address);
    await ganache.setTime(saleStartTime);
    await usdcToUsdtMock.setPrice(USDC);
    await truffleAssert.reverts(dexe.depositUSDT(USDC, {from: user1}), 'Not whitelisted');
  });
  it('should not deposit USDT in round 1 if deposit amount is more than limit in USDC', async function() {
    const limit = USDC;
    await dexe.setUSDTTokenAddress(tokenUSDTMock.address);
    await dexe.setUSDTFeed(usdcToUsdtMock.address);
    await ganache.setTime(saleStartTime);
    await dexe.addToWhitelist(user1, limit);
    await usdcToUsdtMock.setPrice(USDC);
    await truffleAssert.reverts(dexe.depositUSDT(USDT.add(bn(10)), {from: user1}), 'Deposit limit is reached');
  });
  it('should not deposit ETH in round 1 if not whitelisted', async function() {
    await dexe.setETHFeed(usdcToEthMock.address);
    await ganache.setTime(saleStartTime);
    await usdcToEthMock.setPrice(USDC);
    await truffleAssert.reverts(dexe.depositETH({value: ETH, from: user1}), 'Not whitelisted');
  });
  it('should not deposit ETH through receive in round 1 if not whitelisted', async function() {
    await dexe.setETHFeed(usdcToEthMock.address);
    await ganache.setTime(saleStartTime);
    await usdcToEthMock.setPrice(USDC);
    await truffleAssert.reverts(dexe.sendTransaction({value: ETH, from: user1}), 'Not whitelisted');
  });
  it('should not deposit ETH in round 1 if deposit amount is more than limit in USDC', async function() {
    const limit = USDC;
    await dexe.setETHFeed(usdcToEthMock.address);
    await ganache.setTime(saleStartTime);
    await usdcToEthMock.setPrice(USDC);
    await dexe.addToWhitelist(user1, limit);
    await truffleAssert.reverts(dexe.depositETH({value: ETH.mul(bn(2)), from: user1}), 'Deposit limit is reached');
  });
  it('should not deposit ETH through receive in round 1 if deposit amount is more than limit in USDC', async function() {
    const limit = USDC;
    await dexe.setETHFeed(usdcToEthMock.address);
    await ganache.setTime(saleStartTime);
    await usdcToEthMock.setPrice(USDC);
    await dexe.addToWhitelist(user1, limit);
    await truffleAssert.reverts(dexe.sendTransaction({value: ETH.mul(bn(2)), from: user1}), 'Deposit limit is reached');
  });
  it('should not deposit USDC in round 1 if removed from whitelist', async function() {
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await ganache.setTime(saleStartTime);
    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.removeFromWhitelist(user1);
    await truffleAssert.reverts(dexe.depositUSDC(USDC, {from: user1}), 'Not whitelisted');
  });
  it('should not deposit USDT in round 1 if removed from whitelist', async function() {
    await dexe.setUSDTTokenAddress(tokenUSDTMock.address);
    await dexe.setUSDTFeed(usdcToUsdtMock.address);
    await ganache.setTime(saleStartTime);
    await usdcToUsdtMock.setPrice(USDC);
    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.removeFromWhitelist(user1);
    await truffleAssert.reverts(dexe.depositUSDT(USDC, {from: user1}), 'Not whitelisted');
  });
  it('should not deposit ETH in round 1 if removed from whitelist', async function() {
    await dexe.setETHFeed(usdcToEthMock.address);
    await ganache.setTime(saleStartTime);
    await usdcToEthMock.setPrice(USDC);
    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.removeFromWhitelist(user1);
    await truffleAssert.reverts(dexe.depositETH({value: ETH, from: user1}), 'Not whitelisted');
  });
  it('should not deposit ETH through receive in round 1 if removed from whitelist', async function() {
    await dexe.setETHFeed(usdcToEthMock.address);
    await ganache.setTime(saleStartTime);
    await usdcToEthMock.setPrice(USDC);
    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.removeFromWhitelist(user1);
    await truffleAssert.reverts(dexe.sendTransaction({value: ETH, from: user1}), 'Not whitelisted');
  });
  it('should not deposit USDT if USDT price feed is not set', async function() {
    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.setETHFeed(usdcToEthMock.address);
    await dexe.setDEXEFeed(usdcToEthMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await ganache.setTime(saleStartTime);
    await truffleAssert.reverts(dexe.depositUSDT(USDC, {from: user1}));
  });
  it('should not deposit ETH if ETH price feed is not set', async function() {
    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.setUSDTFeed(usdcToEthMock.address);
    await dexe.setDEXEFeed(usdcToEthMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await ganache.setTime(saleStartTime);
    await truffleAssert.reverts(dexe.depositETH({value: ETH, from: user1}));
  });
  it('should not deposit ETH through receive if ETH price feed is not set', async function() {
    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.setUSDTFeed(usdcToEthMock.address);
    await dexe.setDEXEFeed(usdcToEthMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await ganache.setTime(saleStartTime);
    await truffleAssert.reverts(dexe.sendTransaction({value: ETH, from: user1}));
  });

  it('should burn tokens before tokensale', async function() {
    const balance = bn(1000);
    const burnAmount = bn(300);
    const finalBalance = bn(700);
    await ganache.setTime(saleStartTime - 100);
    await dexe.transfer(user1, balance);
    await dexe.burn(burnAmount, {from: user1});
    await assertBalance(user1, finalBalance);
    await assertHolderRound(1, user1, 0, finalBalance, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 1, finalBalance);
    await assertBalance(owner, OWNER_BALANCE.sub(balance));
  });
  it('should burn tokens during round 1', async function() {
    const balance = bn(1000);
    const burnAmount = bn(300);
    const finalBalance = bn(700);
    await ganache.setTime(saleStartTime);
    await dexe.transfer(user1, balance);
    await dexe.burn(burnAmount, {from: user1});
    await assertBalance(user1, finalBalance);
    await assertHolderRound(1, user1, 0, finalBalance, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 1, finalBalance);
    await assertBalance(owner, OWNER_BALANCE.sub(balance));
  });
  it('should burn tokens during round 2', async function() {
    const balance = bn(1000);
    const burnAmount = bn(300);
    const finalBalance = bn(700);
    await ganache.setTime(saleStartTime + DAY + 1);
    await dexe.prepareDistribution(1);
    await dexe.transfer(user1, balance);
    await dexe.burn(burnAmount, {from: user1});
    await assertBalance(user1, finalBalance);
    await assertHolderRound(1, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(2, user1, 0, finalBalance, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 2, finalBalance);
    await assertBalance(owner, OWNER_BALANCE.sub(balance));
  });
  it('should burn tokens during round 22', async function() {
    const balance = bn(1000);
    const burnAmount = bn(300);
    const finalBalance = bn(700);
    await ganache.setTime(saleStartTime + 21 * DAYS + 1);
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await prepareDistributions(1, 21);
    await dexe.transfer(user1, balance);
    await dexe.burn(burnAmount, {from: user1});
    await assertBalance(user1, finalBalance);
    await assertHolderRound(1, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(22, user1, 0, finalBalance, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 22, finalBalance);
    await assertBalance(owner, OWNER_BALANCE.sub(balance));
  });
  it('should burn tokens before product launch', async function() {
    const balance = bn(1000);
    const burnAmount = bn(300);
    const finalBalance = bn(700);
    await ganache.setTime(saleEndTime + 1);
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await prepareDistributions(1);
    await dexe.transfer(user1, balance);
    await dexe.burn(burnAmount, {from: user1});
    await assertBalance(user1, finalBalance);
    await assertHolderRound(1, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(22, user1, 0, 0, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 0, finalBalance);
    await assertBalance(owner, OWNER_BALANCE.sub(balance));
  });
  it('should burn tokens after product launch', async function() {
    const balance = bn(1000);
    const burnAmount = bn(300);
    const finalBalance = bn(700);
    await ganache.setTime(saleEndTime + DAY);
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await prepareDistributions(1);
    await dexe.launchProduct();
    await dexe.transfer(user1, balance);
    await dexe.burn(burnAmount, {from: user1});
    await assertBalance(user1, finalBalance);
    await assertHolderRound(1, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(22, user1, 0, 0, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 0, 0);
    await assertBalance(owner, OWNER_BALANCE.sub(balance));
  });

  it('should burn tokens acquired before tokensale', async function() {
    const balance = bn(1000);
    const burnAmount = bn(300);
    const balanceAfterBurn = bn(700);
    const extraBurn = bn(10);
    await ganache.setTime(BEFORE_SALE);
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.transfer(user1, balance);
    await dexe.burn(burnAmount, {from: user1});
    await assertBalance(user1, balanceAfterBurn);
    await assertHolderRound(1, user1, 0, balanceAfterBurn, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 1, balanceAfterBurn);
    await ganache.setTime(ROUND_1);
    await dexe.burn(extraBurn, {from: user1});
    const balanceAfterBurn2 = balanceAfterBurn.sub(extraBurn.mul(bn(1)));
    await assertBalance(user1, balanceAfterBurn2);
    await assertHolderRound(1, user1, 0, balanceAfterBurn2, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 1, balanceAfterBurn2);
    await ganache.setTime(ROUND_2);
    await prepareDistributions(1, 1);
    await dexe.burn(extraBurn, {from: user1});
    const balanceAfterBurn3 = balanceAfterBurn.sub(extraBurn.mul(bn(2)));
    await assertBalance(user1, balanceAfterBurn3);
    await assertHolderRound(1, user1, 0, balanceAfterBurn2, HolderRoundStatus.RECEIVED);
    await assertHolderRound(2, user1, 0, balanceAfterBurn3, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 1, balanceAfterBurn3);
    await ganache.setTime(ROUND_22);
    await prepareDistributions(2, 21);
    await dexe.burn(extraBurn, {from: user1});
    const balanceAfterBurn4 = balanceAfterBurn.sub(extraBurn.mul(bn(3)));
    await assertBalance(user1, balanceAfterBurn4);
    await assertHolderRound(1, user1, 0, balanceAfterBurn2, HolderRoundStatus.RECEIVED);
    await assertHolderRound(2, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(20, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(21, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(22, user1, 0, balanceAfterBurn4, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 1, balanceAfterBurn4);
    await ganache.setTime(AFTER_SALE);
    await prepareDistributions(22);
    await dexe.burn(extraBurn, {from: user1});
    const balanceAfterBurn5 = balanceAfterBurn.sub(extraBurn.mul(bn(4)));
    await assertBalance(user1, balanceAfterBurn5);
    await assertHolderRound(1, user1, 0, balanceAfterBurn2, HolderRoundStatus.RECEIVED);
    await assertHolderRound(2, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(20, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(21, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(22, user1, 0, balanceAfterBurn4, HolderRoundStatus.RECEIVED);
    await assertUserInfo(user1, 1, balanceAfterBurn5);
    await ganache.setTime(AFTER_LAUNCH);
    await dexe.launchProduct();
    await dexe.burn(extraBurn, {from: user1});
    const balanceAfterBurn6 = balanceAfterBurn.sub(extraBurn.mul(bn(5)));
    await assertBalance(user1, balanceAfterBurn6);
    await assertHolderRound(1, user1, 0, balanceAfterBurn2, HolderRoundStatus.RECEIVED);
    await assertHolderRound(2, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(20, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(21, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(22, user1, 0, balanceAfterBurn4, HolderRoundStatus.RECEIVED);
    await assertUserInfo(user1, 1, balanceAfterBurn5);
    await assertBalance(owner, OWNER_BALANCE.sub(balance));
  });
  it('should burn tokens acquired during round 1', async function() {
    const balance = bn(1000);
    const burnAmount = bn(300);
    const balanceAfterBurn = bn(700);
    const extraBurn = bn(10);
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await ganache.setTime(ROUND_1);
    await dexe.transfer(user1, balance);
    await dexe.burn(burnAmount, {from: user1});
    const balanceAfterBurn2 = balanceAfterBurn;
    await assertBalance(user1, balanceAfterBurn2);
    await assertHolderRound(1, user1, 0, balanceAfterBurn2, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 1, balanceAfterBurn2);
    await ganache.setTime(ROUND_2);
    await prepareDistributions(1, 1);
    await dexe.burn(extraBurn, {from: user1});
    const balanceAfterBurn3 = balanceAfterBurn.sub(extraBurn.mul(bn(1)));
    await assertBalance(user1, balanceAfterBurn3);
    await assertHolderRound(1, user1, 0, balanceAfterBurn2, HolderRoundStatus.RECEIVED);
    await assertHolderRound(2, user1, 0, balanceAfterBurn3, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 1, balanceAfterBurn3);
    await ganache.setTime(ROUND_22);
    await prepareDistributions(2, 21);
    await dexe.burn(extraBurn, {from: user1});
    const balanceAfterBurn4 = balanceAfterBurn.sub(extraBurn.mul(bn(2)));
    await assertBalance(user1, balanceAfterBurn4);
    await assertHolderRound(1, user1, 0, balanceAfterBurn2, HolderRoundStatus.RECEIVED);
    await assertHolderRound(2, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(20, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(21, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(22, user1, 0, balanceAfterBurn4, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 1, balanceAfterBurn4);
    await ganache.setTime(AFTER_SALE);
    await prepareDistributions(22);
    await dexe.burn(extraBurn, {from: user1});
    const balanceAfterBurn5 = balanceAfterBurn.sub(extraBurn.mul(bn(3)));
    await assertBalance(user1, balanceAfterBurn5);
    await assertHolderRound(1, user1, 0, balanceAfterBurn2, HolderRoundStatus.RECEIVED);
    await assertHolderRound(2, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(20, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(21, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(22, user1, 0, balanceAfterBurn4, HolderRoundStatus.RECEIVED);
    await assertUserInfo(user1, 1, balanceAfterBurn5);
    await ganache.setTime(AFTER_LAUNCH);
    await dexe.launchProduct();
    await dexe.burn(extraBurn, {from: user1});
    const balanceAfterBurn6 = balanceAfterBurn.sub(extraBurn.mul(bn(4)));
    await assertBalance(user1, balanceAfterBurn6);
    await assertHolderRound(1, user1, 0, balanceAfterBurn2, HolderRoundStatus.RECEIVED);
    await assertHolderRound(2, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(20, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(21, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(22, user1, 0, balanceAfterBurn4, HolderRoundStatus.RECEIVED);
    await assertUserInfo(user1, 1, balanceAfterBurn5);
    await assertBalance(owner, OWNER_BALANCE.sub(balance));
  });
  it('should burn tokens acquired during round 2', async function() {
    const balance = bn(1000);
    const burnAmount = bn(300);
    const balanceAfterBurn = bn(700);
    const extraBurn = bn(10);
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await ganache.setTime(ROUND_2);
    await prepareDistributions(1, 1);
    await dexe.transfer(user1, balance);
    await dexe.burn(burnAmount, {from: user1});
    const balanceAfterBurn3 = balanceAfterBurn;
    await assertBalance(user1, balanceAfterBurn3);
    await assertHolderRound(1, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(2, user1, 0, balanceAfterBurn3, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 2, balanceAfterBurn3);
    await ganache.setTime(ROUND_22);
    await prepareDistributions(2, 21);
    await dexe.burn(extraBurn, {from: user1});
    const balanceAfterBurn4 = balanceAfterBurn.sub(extraBurn.mul(bn(1)));
    await assertBalance(user1, balanceAfterBurn4);
    await assertHolderRound(1, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(2, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(20, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(21, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(22, user1, 0, balanceAfterBurn4, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 2, balanceAfterBurn4);
    await ganache.setTime(AFTER_SALE);
    await prepareDistributions(22);
    await dexe.burn(extraBurn, {from: user1});
    assertBNequal((await dexe.holderRounds(23, user1)).endBalance, 0);
    const balanceAfterBurn5 = balanceAfterBurn.sub(extraBurn.mul(bn(2)));
    await assertBalance(user1, balanceAfterBurn5);
    await assertHolderRound(1, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(2, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(20, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(21, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(22, user1, 0, balanceAfterBurn4, HolderRoundStatus.RECEIVED);
    await assertUserInfo(user1, 2, balanceAfterBurn5);
    await ganache.setTime(AFTER_LAUNCH);
    await dexe.launchProduct();
    await dexe.burn(extraBurn, {from: user1});
    const balanceAfterBurn6 = balanceAfterBurn.sub(extraBurn.mul(bn(3)));
    await assertBalance(user1, balanceAfterBurn6);
    await assertHolderRound(1, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(2, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(20, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(21, user1, 0, balanceAfterBurn3, HolderRoundStatus.RECEIVED);
    await assertHolderRound(22, user1, 0, balanceAfterBurn4, HolderRoundStatus.RECEIVED);
    await assertUserInfo(user1, 2, balanceAfterBurn5);
    await assertBalance(owner, OWNER_BALANCE.sub(balance));
  });
  it('should burn tokens acquired during round 22', async function() {
    const balance = bn(1000);
    const burnAmount = bn(300);
    const balanceAfterBurn = bn(700);
    const extraBurn = bn(10);
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await ganache.setTime(ROUND_22);
    await prepareDistributions(1, 21);
    await dexe.transfer(user1, balance);
    await dexe.burn(burnAmount, {from: user1});
    const balanceAfterBurn4 = balanceAfterBurn;
    await assertBalance(user1, balanceAfterBurn4);
    await assertHolderRound(1, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(2, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(20, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(21, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(22, user1, 0, balanceAfterBurn4, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 22, balanceAfterBurn4);
    await ganache.setTime(AFTER_SALE);
    await prepareDistributions(22);
    await dexe.burn(extraBurn, {from: user1});
    const balanceAfterBurn5 = balanceAfterBurn.sub(extraBurn.mul(bn(1)));
    await assertBalance(user1, balanceAfterBurn5);
    await assertHolderRound(1, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(2, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(20, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(21, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(22, user1, 0, balanceAfterBurn4, HolderRoundStatus.RECEIVED);
    await assertUserInfo(user1, 22, balanceAfterBurn5);
    await ganache.setTime(AFTER_LAUNCH);
    await dexe.launchProduct();
    await dexe.burn(extraBurn, {from: user1});
    const balanceAfterBurn6 = balanceAfterBurn.sub(extraBurn.mul(bn(2)));
    await assertBalance(user1, balanceAfterBurn6);
    await assertHolderRound(1, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(2, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(20, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(21, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(22, user1, 0, balanceAfterBurn4, HolderRoundStatus.RECEIVED);
    await assertUserInfo(user1, 22, balanceAfterBurn5);
    await assertBalance(owner, OWNER_BALANCE.sub(balance));
  });
  it('should burn tokens acquired before product launch', async function() {
    const balance = bn(1000);
    const burnAmount = bn(300);
    const balanceAfterBurn = bn(700);
    const extraBurn = bn(10);
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await ganache.setTime(AFTER_SALE);
    await prepareDistributions(1, 22);
    await dexe.transfer(user1, balance);
    await dexe.burn(burnAmount, {from: user1});
    const balanceAfterBurn5 = balanceAfterBurn;
    await assertBalance(user1, balanceAfterBurn5);
    await assertHolderRound(1, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(2, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(20, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(21, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(22, user1, 0, 0, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 0, balanceAfterBurn5);
    await ganache.setTime(AFTER_LAUNCH);
    await dexe.launchProduct();
    await dexe.burn(extraBurn, {from: user1});
    const balanceAfterBurn6 = balanceAfterBurn.sub(extraBurn.mul(bn(1)));
    await assertBalance(user1, balanceAfterBurn6);
    await assertHolderRound(1, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(2, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(20, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(21, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(22, user1, 0, 0, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 0, balanceAfterBurn5);
    await assertBalance(owner, OWNER_BALANCE.sub(balance));
  });
  it('should burn tokens acquired after product launch', async function() {
    const balance = bn(1000);
    const burnAmount = bn(300);
    const balanceAfterBurn = bn(700);
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await ganache.setTime(AFTER_SALE);
    await prepareDistributions(1, 22);
    await ganache.setTime(AFTER_LAUNCH);
    await dexe.launchProduct();
    await dexe.transfer(user1, balance);
    await dexe.burn(burnAmount, {from: user1});
    await assertBalance(user1, balanceAfterBurn);
    await assertHolderRound(1, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(2, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(20, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(21, user1, 0, 0, HolderRoundStatus.NONE);
    await assertHolderRound(22, user1, 0, 0, HolderRoundStatus.NONE);
    await assertUserInfo(user1, 0, 0);
    await assertBalance(owner, OWNER_BALANCE.sub(balance));
  });

  it('should transfer tokens acquired at any moment between owner and 3 holders', async function() {
    const {doTransfer, doPrepareDistributions, doLaunch} = await stateChecker('1');
    await ganache.setTime(BEFORE_SALE);
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await doTransfer(OWNER, userOne, 1600);
    await doTransfer(userOne, userTwo, 500);
    await doTransfer(userTwo, userOne, 1);
    await ganache.setTime(ROUND_1);
    await doTransfer(userOne, OWNER, 1);
    await doTransfer(userTwo, userOne, 499);
    await ganache.setTime(ROUND_2);
    await doPrepareDistributions(1, 1);
    await doTransfer(userOne, userTwo, 1);
    await doTransfer(userOne, userOne, 1498);
    await doTransfer(userOne, userThree, 1498);
    await doTransfer(userOne, userOne, 0);
    await doTransfer(userThree, OWNER, 98);
    await ganache.setTime(ROUND_22);
    await doPrepareDistributions(2, 21);
    await doTransfer(userTwo, userThree, 1);
    await doTransfer(userOne, userTwo, 0);
    await doTransfer(OWNER, userTwo, 100);
    await ganache.setTime(AFTER_SALE);
    await doPrepareDistributions(22);
    await ganache.setTime(AFTER_SALE);
    await doTransfer(OWNER, userThree, 1);
    await ganache.setTime(AFTER_SALE);
    await doTransfer(userThree, userTwo, 1402);
    await ganache.setTime(AFTER_SALE);
    await doTransfer(userTwo, userThree, 1402);
    await ganache.setTime(AFTER_SALE);
    await doTransfer(userThree, userTwo, 1401);
    await ganache.setTime(AFTER_LAUNCH);
    await doLaunch(OWNER);
    await ganache.setTime(AFTER_LAUNCH);
    await doTransfer(userTwo, userOne, 1501);
  });

  it('should NOT transfer tokens on round 2 before round 1 is not prepared', async function() {
    await ganache.setTime(BEFORE_SALE);
    await dexe.transfer(user1, 1000);
    await ganache.setTime(ROUND_2);
    await truffleAssert.reverts(dexe.transfer(owner, 500, {from: user1}), 'Round is not prepared');
  });
  it('should NOT transfer tokens after sale before round 22 is prepared', async function() {
    await ganache.setTime(ROUND_22);
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await prepareDistributions(1, 21);
    await dexe.transfer(user1, 1000);
    await ganache.setTime(AFTER_SALE);
    await truffleAssert.reverts(dexe.transfer(owner, 500, {from: user1}), 'Round is not prepared');
  });
  it('should not launch product by anyone', async function() {
    await ganache.setTime(AFTER_SALE);
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await prepareDistributions(1, 22);
    await truffleAssert.reverts(dexe.launchProduct({from: user1}), 'Ownable: caller is not the owner');
  });
  it('should not launch product before sale end', async function() {
    await ganache.setTime(AFTER_SALE - 10);
    await truffleAssert.reverts(dexe.launchProduct(), 'Tokensale is not ended yet');
  });
  it('should not launch product before round 22 is prepared', async function() {
    await ganache.setTime(ROUND_22);
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await prepareDistributions(1, 21);
    await ganache.setTime(AFTER_SALE);
    await truffleAssert.reverts(dexe.launchProduct(), 'Tokensale is not processed');
  });
  it('should not launch product if already launched', async function() {
    await ganache.setTime(AFTER_SALE);
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await prepareDistributions(1, 22);
    await dexe.launchProduct();
    await truffleAssert.reverts(dexe.launchProduct(), 'Product already launched');
  });

  it('should receive 20% rewards for every round if deposited or received tokens in the first round, others being empty', async function() {
    const {doTransfer, doPrepareDistributions, doDepositUSDC} = await stateChecker('2');
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await ganache.setTime(BEFORE_SALE);
    await doTransfer(OWNER, userOne, 1000);
    await ganache.setTime(ROUND_1);
    await doTransfer(OWNER, userTwo, 10000);
    await doDepositUSDC(userThree, USDC);
    await ganache.setTime(ROUND_2);
    await doPrepareDistributions(1, 1);
    await doTransfer(userOne, userOne, 0);
    await doTransfer(userTwo, userTwo, 0);
    await doTransfer(userThree, userThree, 0);
    await ganache.setTime(AFTER_SALE);
    await doPrepareDistributions(2, 22);
    await ganache.setTime(AFTER_SALE);
    await doTransfer(userOne, userOne, 0);
    await ganache.setTime(AFTER_SALE);
    await doTransfer(userTwo, userTwo, 0);
    await ganache.setTime(AFTER_SALE);
    await doTransfer(userThree, userThree, 0);
  });

  it('should receive 8% rewards for every round if deposited or received tokens in the second round, others being empty', async function() {
    const {doTransfer, doPrepareDistributions, doDepositUSDC} = await stateChecker('3');
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await ganache.setTime(ROUND_2);
    await doPrepareDistributions(1, 1);
    await doDepositUSDC(userThree, ROUND_SIZE_BASE.mul(USDC));
    await doTransfer(OWNER, userOne, 1000);
    await doTransfer(OWNER, userTwo, 10000);
    await ganache.setTime(ROUND_2 + DAY);
    await doPrepareDistributions(2, 2);
    await doTransfer(userOne, userOne, 0);
    await doTransfer(userTwo, userTwo, 0);
    await doTransfer(userThree, userThree, 0);
    await ganache.setTime(AFTER_SALE);
    await doPrepareDistributions(3, 22);
    await ganache.setTime(AFTER_SALE);
    await doTransfer(userOne, userOne, 0);
    await ganache.setTime(AFTER_SALE);
    await doTransfer(userTwo, userTwo, 0);
    await ganache.setTime(AFTER_SALE);
    await doTransfer(userThree, userThree, 0);
  });

  it('should receive ~20% rewards x2 for every round if deposited or increased tokens balance every round after first', async function() {
    const {doTransfer, doDepositUSDC, doPrepareDistribution, doReceiveAll} = await stateChecker('4');
    let balance1 = bn(1000);
    let balance2 = bn(10000);
    let deposit3 = FIRST_ROUND_SIZE_BASE.mul(USDC);

    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await usdcToDexeMock.setPrice(USDC);
    await ganache.setTime(BEFORE_SALE);
    await doTransfer(OWNER, userOne, balance1);
    await ganache.setTime(ROUND_1);
    await doTransfer(OWNER, userTwo, balance2);
    await doDepositUSDC(userThree, deposit3);
    for (let round = 1; round <= 21; round++) {
      await ganache.setTime(ROUND_1 + (round * DAYS));
      await doPrepareDistribution(round);
      await doReceiveAll(userOne);
      await doReceiveAll(userTwo);
      await doReceiveAll(userThree);
      const increase1 = balance1.div(bn(100)).add(bn(1));
      await doTransfer(OWNER, userOne, increase1);
      balance1 = balance1.add(increase1);
      const increase2 = balance2.div(bn(100)).add(bn(1));
      await doTransfer(OWNER, userTwo, increase2);
      balance2 = balance2.add(increase2);
      const pay3 = deposit3.div(bn(100)).add(bn(1));
      await doDepositUSDC(userThree, pay3);
      deposit3 = deposit3.add(pay3);
    }
    await ganache.setTime(AFTER_SALE);
    await doPrepareDistribution(22);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userOne);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userTwo);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userThree);
  });

  it('should receive ~8% rewards x2 for every round if deposited or increased tokens balance every round after first', async function() {
    const {doTransfer, doDepositUSDC, doPrepareDistribution, doReceiveAll} = await stateChecker('5');
    let balance1 = bn(1000);
    let balance2 = bn(10000);
    const deposit3 = USDC;

    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await usdcToDexeMock.setPrice(USDC);
    await ganache.setTime(ROUND_2);
    await doPrepareDistribution(1);
    await doTransfer(OWNER, userOne, balance1);
    await doTransfer(OWNER, userTwo, balance2);
    await doDepositUSDC(userThree, deposit3);
    for (let round = 2; round <= 21; round++) {
      await ganache.setTime(ROUND_1 + (round * DAYS));
      await doPrepareDistribution(round);
      await doReceiveAll(userOne);
      await doReceiveAll(userTwo);
      await doReceiveAll(userThree);
      const increase1 = balance1.div(bn(100)).add(bn(1));
      await doTransfer(OWNER, userOne, increase1);
      balance1 = balance1.add(increase1);
      const increase2 = balance2.div(bn(100)).add(bn(1));
      await doTransfer(OWNER, userTwo, increase2);
      balance2 = balance2.add(increase2);
      await doDepositUSDC(userThree, deposit3);
    }
    await ganache.setTime(AFTER_SALE);
    await doPrepareDistribution(22);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userOne);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userTwo);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userThree);
  });

  it('should receive 5% rewards x2 for every round if deposited or increased tokens balance every round after first', async function() {
    const {doTransfer, doDepositUSDC, doPrepareDistribution, doReceiveAll} = await stateChecker('6');
    let balance1 = bn(1000);
    let balance2 = bn(10000);
    const deposit3 = FIRST_ROUND_SIZE_BASE.mul(USDC);
    const depositFullRound = ROUND_SIZE_BASE.mul(USDC);

    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await usdcToDexeMock.setPrice(USDC);
    await ganache.setTime(BEFORE_SALE);
    await doTransfer(OWNER, userOne, balance1);
    await ganache.setTime(ROUND_1);
    await doTransfer(OWNER, userTwo, balance2);
    await doDepositUSDC(userThree, deposit3);
    for (let round = 1; round <= 21; round++) {
      await ganache.setTime(ROUND_1 + (round * DAYS));
      await doPrepareDistribution(round);
      await doReceiveAll(userOne);
      await doReceiveAll(userTwo);
      await doReceiveAll(userThree);
      const increase1 = balance1.div(bn(100)).add(bn(1));
      await doTransfer(OWNER, userOne, increase1);
      balance1 = balance1.add(increase1);
      const increase2 = balance2.div(bn(100)).add(bn(1));
      await doTransfer(OWNER, userTwo, increase2);
      balance2 = balance2.add(increase2);
      await doDepositUSDC(userThree, depositFullRound);
    }
    await ganache.setTime(AFTER_SALE);
    await doPrepareDistribution(22);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userOne);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userTwo);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userThree);
  });
  it('should receive 2% rewards x2 for every round if deposited or increased tokens balance every round after first', async function() {
    const {doTransfer, doDepositUSDC, doPrepareDistribution, doReceiveAll} = await stateChecker('7');
    let balance1 = bn(1000);
    let balance2 = bn(10000);
    const depositFullRound = ROUND_SIZE_BASE.mul(USDC);

    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await usdcToDexeMock.setPrice(USDC);
    await ganache.setTime(ROUND_2);
    await doPrepareDistribution(1);
    await doTransfer(OWNER, userOne, balance1);
    await doTransfer(OWNER, userTwo, balance2);
    await doDepositUSDC(userThree, depositFullRound);
    for (let round = 2; round <= 21; round++) {
      await ganache.setTime(ROUND_1 + (round * DAYS));
      await doPrepareDistribution(round);
      await doReceiveAll(userOne);
      await doReceiveAll(userTwo);
      await doReceiveAll(userThree);
      const increase1 = balance1.div(bn(100)).add(bn(1));
      await doTransfer(OWNER, userOne, increase1);
      balance1 = balance1.add(increase1);
      const increase2 = balance2.div(bn(100)).add(bn(1));
      await doTransfer(OWNER, userTwo, increase2);
      balance2 = balance2.add(increase2);
      await doDepositUSDC(userThree, depositFullRound);
    }
    await ganache.setTime(AFTER_SALE);
    await doPrepareDistribution(22);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userOne);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userTwo);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userThree);
  });
  it('should receive 5% rewards for every round if not deposited or increased tokens balance enough every round after first', async function() {
    const {doTransfer, doDepositUSDC, doPrepareDistribution, doReceiveAll} = await stateChecker('8');
    let balance1 = bn(1000);
    let balance2 = bn(10000);
    let deposit3 = USDC.mul(bn(200));

    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(owner, USDC_LIMIT_WHITELIST);
    await usdcToDexeMock.setPrice(USDC);
    await ganache.setTime(BEFORE_SALE);
    await doTransfer(OWNER, userOne, balance1);
    await ganache.setTime(ROUND_1);
    await doTransfer(OWNER, userTwo, balance2);
    await doDepositUSDC(userThree, deposit3);
    await doDepositUSDC(OWNER, FIRST_ROUND_SIZE_BASE.mul(USDC).sub(deposit3));
    for (let round = 1; round <= 21; round++) {
      await ganache.setTime(ROUND_1 + (round * DAYS));
      await doPrepareDistribution(round);
      await doReceiveAll(userOne);
      await doReceiveAll(userTwo);
      await doReceiveAll(userThree);
      const increase1 = balance1.div(bn(100)).sub(bn(1));
      await doTransfer(OWNER, userOne, increase1);
      balance1 = balance1.add(increase1);
      const increase2 = balance2.div(bn(100)).sub(bn(1));
      await doTransfer(OWNER, userTwo, increase2);
      balance2 = balance2.add(increase2);
      const pay3 = deposit3.div(bn(100)).sub(bn(1));
      await doDepositUSDC(userThree, pay3);
      deposit3 = deposit3.add(pay3);
      await doDepositUSDC(OWNER, ROUND_SIZE_BASE.mul(USDC).sub(pay3));
    }
    await ganache.setTime(AFTER_SALE);
    await doPrepareDistribution(22);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userOne);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userTwo);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userThree);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(OWNER);
  });
  it('should receive 2% rewards for every round if not deposited or increased tokens balance enough every round after first', async function() {
    const {doTransfer, doDepositUSDC, doPrepareDistribution, doReceiveAll} = await stateChecker('9');
    let balance1 = bn(1000);
    let balance2 = bn(10000);
    let deposit3 = USDC.mul(bn(200));

    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await usdcToDexeMock.setPrice(USDC);
    await ganache.setTime(ROUND_2);
    await doPrepareDistribution(1);
    await doTransfer(OWNER, userOne, balance1);
    await doTransfer(OWNER, userTwo, balance2);
    await doDepositUSDC(userThree, deposit3);
    await doDepositUSDC(OWNER, ROUND_SIZE_BASE.mul(USDC).sub(deposit3));
    for (let round = 2; round <= 21; round++) {
      await ganache.setTime(ROUND_1 + (round * DAYS));
      await doPrepareDistribution(round);
      await doReceiveAll(userOne);
      await doReceiveAll(userTwo);
      await doReceiveAll(userThree);
      const increase1 = balance1.div(bn(100)).sub(bn(1));
      await doTransfer(OWNER, userOne, increase1);
      balance1 = balance1.add(increase1);
      const increase2 = balance2.div(bn(100)).sub(bn(1));
      await doTransfer(OWNER, userTwo, increase2);
      balance2 = balance2.add(increase2);
      const pay3 = deposit3.div(bn(100)).sub(bn(1));
      await doDepositUSDC(userThree, pay3);
      deposit3 = deposit3.add(pay3);
      await doDepositUSDC(OWNER, ROUND_SIZE_BASE.mul(USDC).sub(pay3));
    }
    await ganache.setTime(AFTER_SALE);
    await doPrepareDistribution(22);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userOne);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userTwo);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userThree);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(OWNER);
  });

  it('should distribute if every round is overflown', async function() {
    const {doTransfer, doDepositUSDC, doPrepareDistribution, doReceiveAll} = await stateChecker('10');
    let balance1 = bn(1000);
    let balance2 = bn(10000);
    const depositOverFullRound = ROUND_SIZE_BASE.mul(USDC).mul(bn(2));

    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await usdcToDexeMock.setPrice(USDC);
    await ganache.setTime(ROUND_2);
    await doPrepareDistribution(1);
    await doTransfer(OWNER, userOne, balance1);
    await doTransfer(OWNER, userTwo, balance2);
    await doDepositUSDC(userThree, depositOverFullRound);
    for (let round = 2; round <= 21; round++) {
      await ganache.setTime(ROUND_1 + (round * DAYS));
      await doPrepareDistribution(round);
      await doReceiveAll(userOne);
      await doReceiveAll(userTwo);
      await doReceiveAll(userThree);
      const increase1 = balance1.div(bn(100)).add(bn(1));
      await doTransfer(OWNER, userOne, increase1);
      balance1 = balance1.add(increase1);
      const increase2 = balance2.div(bn(100)).add(bn(1));
      await doTransfer(OWNER, userTwo, increase2);
      balance2 = balance2.add(increase2);
      await doDepositUSDC(userThree, depositOverFullRound);
    }
    await ganache.setTime(AFTER_SALE);
    await doPrepareDistribution(22);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userOne);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userTwo);
    await ganache.setTime(AFTER_SALE);
    await doReceiveAll(userThree);
  });
  it('should distribute 0 if round price is too high due to overfill', async function() {
    const {doDepositUSDC, doPrepareDistribution, doReceiveAll} = await stateChecker('11');
    const depositTooMuch = ROUND_SIZE_BASE.mul(USDC).mul(DEXE);
    const depositMinimum = USDC;

    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await usdcToDexeMock.setPrice(USDC);
    await ganache.setTime(ROUND_2);
    await doPrepareDistribution(1);
    await doDepositUSDC(userOne, depositTooMuch);
    await doDepositUSDC(userTwo, depositMinimum);
    await ganache.setTime(ROUND_2 + DAY);
    await doPrepareDistribution(2);
    await doReceiveAll(userOne);
    await doReceiveAll(userTwo);
  });
  it('should distribute 0 if round price is too high returned from the feed', async function() {
    const {doDepositUSDC, doPrepareDistribution, doReceiveAll} = await stateChecker('12');
    const depositMinimum = USDC;

    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await usdcToDexeMock.setPrice(DEXE.mul(USDC).mul(bn(10)).add(bn(1)));
    await ganache.setTime(ROUND_2);
    await doPrepareDistribution(1);
    await doDepositUSDC(userOne, depositMinimum);
    await ganache.setTime(ROUND_2 + DAY);
    await doPrepareDistribution(2);
    await doReceiveAll(userOne);
  });

  it('should not increase endBalance in round 23', async function() {
    // tested in 'should burn tokens acquired during round 2'.
  });
});
