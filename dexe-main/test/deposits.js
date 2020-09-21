const Ganache = require('./helpers/ganache');
const truffleAssert = require('truffle-assertions');
const {saleStartTime} = require('./saleConfig');
const {bn, tokenAsserts, assertBNequal} = require('./helpers/utils');

const Dexe = artifacts.require('Dexe');
const PriceFeedMock = artifacts.require('PriceFeedMock');
const TokenMock = artifacts.require('TokenMock');

contract('Deposits', function(accounts) {
  const ganache = new Ganache(web3);
  afterEach('revert', ganache.revert);

  const USDC = bn(1000000);
  const USDC_LIMIT_WHITELIST = bn('100000000000000000000000000');

  const user1 = accounts[1];
  const user2 = accounts[2];
  const user3 = accounts[3];

  let dexe;
  let usdcToUsdtMock;
  let usdcToEthMock;

  let tokenUSDCMock;
  let tokenUSDTMock;

  let assertBalance;

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

    const helpers = tokenAsserts(dexe, accounts);
    assertBalance = helpers.assertBalance;

    await ganache.snapshot();
  });
  it('should calculate deposit amount correctly with all currencies with minimal deposit 1 USDC each with USDT more expensive that USDC', async () => {
    const depositAmountUSDC1 = bn(1000000);
    const depositAmountUSDT2 = bn(500000);
    const depositAmountETH3 = bn('2500000000000000');
    await ganache.setTime(saleStartTime);

    const USDTPrice = bn(2000000);
    const ETHPrice = bn(400000000);
    const USDC = bn(1000000);
    const USDC_LIMIT_WHITELIST = bn('5000000000000000');

    await usdcToUsdtMock.setPrice(USDTPrice);
    await usdcToEthMock.setPrice(ETHPrice);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user2, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDT(depositAmountUSDT2, {from: user2});
    await dexe.depositETH({from: user3, value: depositAmountETH3});

    const usersUSDCDiposited = bn(1).mul(USDC);

    assertBalance(user1, 0);
    assertBalance(user2, 0);
    assertBalance(user3, 0);

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, usersUSDCDiposited);
    assertBNequal((await dexe.holderRounds(1, user2)).deposited, usersUSDCDiposited);
    assertBNequal((await dexe.holderRounds(1, user3)).deposited, usersUSDCDiposited);
  });
  it('should calculate deposit amount correctly with all currencies with huge deposit each with USDT less expensive that USDC', async () => {
    const depositAmountUSDC1 = bn(1000000).mul(USDC);
    const depositAmountUSDT2 = bn('5555555500000').mul(USDC);
    const depositAmountETH3 = bn('9845342420000000000');
    await ganache.setTime(saleStartTime);

    const USDTPrice = bn(900000);
    const ETHPrice = bn(400000000);

    await usdcToUsdtMock.setPrice(USDTPrice);
    await usdcToEthMock.setPrice(ETHPrice);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user2, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDT(depositAmountUSDT2, {from: user2});
    await dexe.depositETH({from: user3, value: depositAmountETH3});

    const user2USDCDiposited = bn('4999999950000000000');
    const user3USDCDiposited = bn('3938136968');

    assertBalance(user1, 0);
    assertBalance(user2, 0);
    assertBalance(user3, 0);

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, depositAmountUSDC1);
    assertBNequal((await dexe.holderRounds(1, user2)).deposited, user2USDCDiposited);
    assertBNequal((await dexe.holderRounds(1, user3)).deposited, user3USDCDiposited);
  });
  it('should calculate deposit amount correctly with all currencies with middle deposit amount each with price 1 smallest coin of ETH and USDT', async () => {
    const depositAmountUSDC1 = bn(1000000).mul(USDC);
    const depositAmountUSDT2 = bn('5555555500000000000000000').mul(USDC);
    const depositAmountETH3 = bn('9845342420000000000');
    await ganache.setTime(saleStartTime);

    const USDTPrice = bn(1);
    const ETHPrice = bn(1000000);

    await usdcToUsdtMock.setPrice(USDTPrice);
    await usdcToEthMock.setPrice(ETHPrice);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user2, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDT(depositAmountUSDT2, {from: user2});
    await dexe.depositETH({from: user3, value: depositAmountETH3});

    const user2USDCDiposited = bn('5555555500000000000000000');
    const user3USDCDiposited = bn('9845342');

    assertBalance(user1, 0);
    assertBalance(user2, 0);
    assertBalance(user3, 0);

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, depositAmountUSDC1);
    assertBNequal((await dexe.holderRounds(1, user2)).deposited, user2USDCDiposited);
    assertBNequal((await dexe.holderRounds(1, user3)).deposited, user3USDCDiposited);
  });
  it('should not allow to withdraw locked DEXE', async () => {
    await truffleAssert.reverts(dexe.withdrawLocked(dexe.address, user1, 100), 'Cannot withdraw this');
  });
  it('should allow to withdraw locked USDC', async () => {
    const TOTAL_SUPPLY = bn(100000000);
    const DEXE = bn(10).pow(bn(18));
    const liquidityFundAmount = TOTAL_SUPPLY.mul(DEXE).mul(bn(1)).div(bn(100));

    await dexe.withdrawLocked(tokenUSDCMock.address, user1, 100);
    assertBNequal(await dexe.balanceOf(dexe.address), TOTAL_SUPPLY.mul(DEXE).sub(liquidityFundAmount));
  });
  it('should call specified token when doing withdraw locked', async () => {
    await tokenUSDCMock.setSuccess(false);
    await truffleAssert.reverts(dexe.withdrawLocked(tokenUSDCMock.address, user1, 100));
    await dexe.withdrawLocked(tokenUSDTMock.address, user1, 100);
  });
});
