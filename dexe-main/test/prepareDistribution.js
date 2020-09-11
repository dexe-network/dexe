const Ganache = require('./helpers/ganache');
const truffleAssert = require('truffle-assertions');
const {saleStartTime, saleEndTime} = require('./saleConfig');
const {bn, assertBNequal, prepareDistributions} = require('./helpers/utils');

const Dexe = artifacts.require('Dexe');
const PriceFeedMock = artifacts.require('PriceFeedMock');
const TokenMock = artifacts.require('TokenMock');


contract('Prepare distribution', function(accounts) {
  const ganache = new Ganache(web3);
  afterEach('revert', ganache.revert);

  const user1 = accounts[1];
  const user2 = accounts[2];
  const user3 = accounts[3];

  const DEXE = bn(10).pow(bn(18));
  const USDC = bn(10**6);
  const ROUND_DURATION_SEC = 86400;
  const ONE_HOUR = 3600;
  const FIRST_ROUND_SIZE = bn(1000000);
  const ROUND_SIZE = 190476;
  const userOne = accounts[1];
  const userTwo = accounts[2];
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const USDC_LIMIT_WHITELIST = bn('5000000000000000');

  const TOTAL_SUPPLY = bn(100000000);

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

  it('should not be possible to prepare distribution if previous round is not prepared', async () => {
    const depositAmountUSDC = bn(100000000);
    await ganache.setTime(saleStartTime);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC, {from: user1});

    assertBNequal(await dexe.balanceOf(user1), 0);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2 - ONE_HOUR + 1);

    await truffleAssert.reverts(dexe.prepareDistribution(2), 'Previous round not prepared');

    assertBNequal((await dexe.rounds(1)).roundPrice, 0);
    assertBNequal((await dexe.rounds(2)).roundPrice, 0);
  });
  it('should not be possible to prepare distribution if deposit round is not ended yet', async () => {
    const depositAmountUSDC = bn(100000000);
    await ganache.setTime(saleStartTime);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC, {from: user1});

    assertBNequal(await dexe.balanceOf(user1), 0);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR - 1);

    await truffleAssert.reverts(dexe.prepareDistribution(1), 'Deposit round not ended');
  });
  it('should not be possible to prepare distribution of already prepared round', async () => {
    const depositAmountUSDC = bn(100000000);
    await ganache.setTime(saleStartTime);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC, {from: user1});

    assertBNequal(await dexe.balanceOf(user1), 0);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR + 1);

    await dexe.prepareDistribution(1);

    assertBNequal((await dexe.rounds(1)).roundPrice, depositAmountUSDC.div(FIRST_ROUND_SIZE));

    await truffleAssert.reverts(dexe.prepareDistribution(1), 'Round already prepared');

    assertBNequal((await dexe.rounds(1)).roundPrice, depositAmountUSDC.div(FIRST_ROUND_SIZE));
  });
  it('should not be possible to prepare distribution of round 0', async () => {
    const depositAmountUSDC = bn(100000000);
    await ganache.setTime(saleStartTime);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC, {from: user1});

    assertBNequal(await dexe.balanceOf(user1), 0);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR + 1);

    assertBNequal((await dexe.rounds(1)).roundPrice, 0);

    await truffleAssert.reverts(dexe.prepareDistribution(0),
      'Round is not valid');

    assertBNequal((await dexe.rounds(0)).roundPrice, 0);
    assertBNequal((await dexe.rounds(1)).roundPrice, 0);
  });
  it('should not be possible to prepare distribution of round 23', async () => {
    const depositAmountUSDC = bn(100000000);
    await ganache.setTime(saleStartTime);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC, {from: user1});

    assertBNequal(await dexe.balanceOf(user1), 0);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 23 - ONE_HOUR + 1);

    assertBNequal((await dexe.rounds(1)).roundPrice, 0);

    await truffleAssert.reverts(dexe.prepareDistribution(23),
      'Round is not valid');

    assertBNequal((await dexe.rounds(23)).roundPrice, 0);
    assertBNequal((await dexe.rounds(1)).roundPrice, 0);
  });
  it('should not prepare distribution precise with price is lover than range', async () => {
    const depositAmountUSDC1 = bn(300000).mul(USDC);
    const depositAmountUSDC2 = bn(2000).mul(USDC);
    const depositAmountUSDC3 = bn(30).mul(USDC);
    await ganache.setTime(saleStartTime);

    const dxPriceFromFeed = bn(2).mul(USDC);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user2, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    assertBNequal(await dexe.balanceOf(user1), 0);
    assertBNequal(await dexe.balanceOf(user2), 0);
    assertBNequal(await dexe.balanceOf(user3), 0);

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, depositAmountUSDC1);
    assertBNequal((await dexe.holderRounds(1, user2)).deposited, depositAmountUSDC2);
    assertBNequal((await dexe.holderRounds(1, user3)).deposited, depositAmountUSDC3);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR + 1);

    await dexe.prepareDistribution(1);

    assertBNequal((await dexe.rounds(1)).roundPrice,
      (depositAmountUSDC1.add(depositAmountUSDC2).add(depositAmountUSDC3)).div(FIRST_ROUND_SIZE));

    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2 - ONE_HOUR + 1);

    await usdcToDexeMock.setPrice(dxPriceFromFeed);
    assertBNequal(await dexe.currentPrice(), dxPriceFromFeed);

    await truffleAssert.reverts(dexe.prepareDistributionPrecise(2,
      dxPriceFromFeed.add(bn(10)), dxPriceFromFeed.add(bn(50))), 'Price is out of range');
  });
  it('should not prepare distribution precise with price is higher than range', async () => {
    const depositAmountUSDC1 = bn(300000).mul(USDC);
    const depositAmountUSDC2 = bn(2000).mul(USDC);
    const depositAmountUSDC3 = bn(30).mul(USDC);
    await ganache.setTime(saleStartTime);

    const dxPriceFromFeed = bn(2).mul(USDC);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user2, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    assertBNequal(await dexe.balanceOf(user1), 0);
    assertBNequal(await dexe.balanceOf(user2), 0);
    assertBNequal(await dexe.balanceOf(user3), 0);

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, depositAmountUSDC1);
    assertBNequal((await dexe.holderRounds(1, user2)).deposited, depositAmountUSDC2);
    assertBNequal((await dexe.holderRounds(1, user3)).deposited, depositAmountUSDC3);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR + 1);

    await dexe.prepareDistribution(1);

    assertBNequal((await dexe.rounds(1)).roundPrice,
      (depositAmountUSDC1.add(depositAmountUSDC2).add(depositAmountUSDC3)).div(FIRST_ROUND_SIZE));

    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2 - ONE_HOUR + 1);

    await usdcToDexeMock.setPrice(dxPriceFromFeed);
    assertBNequal(await dexe.currentPrice(), dxPriceFromFeed);

    await truffleAssert.reverts(dexe.prepareDistributionPrecise(2,
      dxPriceFromFeed.sub(bn(50)), dxPriceFromFeed.sub(bn(10))), 'Price is out of range');
  });
  it('should prepare distribution correctly for round 1 if nobody deposited', async () => {
    await ganache.setTime(saleStartTime);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);

    assertBNequal(await dexe.balanceOf(user1), 0);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR + 1);

    assertBNequal((await dexe.rounds(1)).roundPrice, 0);

    await dexe.prepareDistribution(1);

    assertBNequal((await dexe.rounds(1)).roundPrice, 1);
  });
  it('should prepare distribution correctly for round 1 if few users deposited', async () => {
    const depositAmountUSDC1 = bn(100000000);
    const depositAmountUSDC2 = bn(2000000000);
    const depositAmountUSDC3 = bn(30000000);
    await ganache.setTime(saleStartTime);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user2, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    assertBNequal(await dexe.balanceOf(user1), 0);
    assertBNequal(await dexe.balanceOf(user2), 0);
    assertBNequal(await dexe.balanceOf(user3), 0);

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, depositAmountUSDC1);
    assertBNequal((await dexe.holderRounds(1, user2)).deposited, depositAmountUSDC2);
    assertBNequal((await dexe.holderRounds(1, user3)).deposited, depositAmountUSDC3);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR + 1);

    await dexe.prepareDistribution(1);

    assertBNequal((await dexe.rounds(1)).roundPrice,
      (depositAmountUSDC1.add(depositAmountUSDC2).add(depositAmountUSDC3)).div(FIRST_ROUND_SIZE));
  });
  it('should prepare distribution correctly for round 1 if few users deposited and made ordinary token transfers between each other', async () => {
    const depositAmountUSDC1 = bn(100000000);
    const depositAmountUSDC2 = bn(2000000000);
    const depositAmountUSDC3 = bn(30000000);

    const transferToUser1Amount = bn(1100000000);
    const transferToUser2Amount = bn(41000000);
    const transferToUser3Amount = bn(700000000000);
    const transferFromUser1ToUser3Amount = bn(550000);

    await dexe.transfer(user1, transferToUser1Amount);
    await dexe.transfer(user2, transferToUser2Amount);

    await ganache.setTime(saleStartTime);

    await dexe.transfer(user3, transferToUser3Amount);
    await dexe.transfer(user3, transferFromUser1ToUser3Amount, {from: user1});

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user2, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    assertBNequal(await dexe.balanceOf(user1),
      transferToUser1Amount.sub(transferFromUser1ToUser3Amount));
    assertBNequal(await dexe.balanceOf(user2), transferToUser2Amount);
    assertBNequal(await dexe.balanceOf(user3),
      transferToUser3Amount.add(transferFromUser1ToUser3Amount));

    assertBNequal((await dexe.holderRounds(1, user1)).endBalance,
      transferToUser1Amount.sub(transferFromUser1ToUser3Amount));
    assertBNequal((await dexe.holderRounds(1, user2)).endBalance, transferToUser2Amount);
    assertBNequal((await dexe.holderRounds(1, user3)).endBalance,
      transferToUser3Amount.add(transferFromUser1ToUser3Amount));

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, depositAmountUSDC1);
    assertBNequal((await dexe.holderRounds(1, user2)).deposited, depositAmountUSDC2);
    assertBNequal((await dexe.holderRounds(1, user3)).deposited, depositAmountUSDC3);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR + 1);

    await dexe.prepareDistribution(1);

    assertBNequal((await dexe.rounds(1)).roundPrice,
      (depositAmountUSDC1.add(depositAmountUSDC2).add(depositAmountUSDC3)).div(FIRST_ROUND_SIZE));
  });
  it('should prepare distribution correctly for round 2 if few users deposited and round is almost full', async () => {
    const depositAmountUSDC1 = bn(300000).mul(USDC);
    const depositAmountUSDC2 = bn(2000).mul(USDC);
    const depositAmountUSDC3 = bn(30).mul(USDC);
    await ganache.setTime(saleStartTime);

    const dxPriceFromFeed = bn(2).mul(USDC);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user2, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    assertBNequal(await dexe.balanceOf(user1), 0);
    assertBNequal(await dexe.balanceOf(user2), 0);
    assertBNequal(await dexe.balanceOf(user3), 0);

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, depositAmountUSDC1);
    assertBNequal((await dexe.holderRounds(1, user2)).deposited, depositAmountUSDC2);
    assertBNequal((await dexe.holderRounds(1, user3)).deposited, depositAmountUSDC3);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR + 1);

    await dexe.prepareDistribution(1);

    assertBNequal((await dexe.rounds(1)).roundPrice,
      (depositAmountUSDC1.add(depositAmountUSDC2).add(depositAmountUSDC3)).div(FIRST_ROUND_SIZE));

    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2 - ONE_HOUR + 1);

    await usdcToDexeMock.setPrice(dxPriceFromFeed);
    assertBNequal(await dexe.currentPrice(), dxPriceFromFeed);

    const result = await dexe.prepareDistribution(2);

    const totalDeposited = (await dexe.rounds(2)).totalDeposited;

    // chcek if round is not fully bought
    assert.isTrue((bn(ROUND_SIZE).mul(await dexe.currentPrice()))
    .sub(totalDeposited) > 0);

    const expectedPrice = bn(1958566);

    assertBNequal((await dexe.rounds(2)).roundPrice, expectedPrice);

    const amountToBurn = bn('36266236325965017262630');

    assert.equal(result.logs[1].args.from, dexe.address);
    assert.equal(result.logs[1].args.to, ZERO_ADDRESS);
    assertBNequal(result.logs[1].args.value, amountToBurn);

    assertBNequal(await dexe.balanceOf(dexe.address), bn(99000000).mul(DEXE).sub(amountToBurn));
    assertBNequal(await dexe.totalSupply(), TOTAL_SUPPLY.mul(DEXE).sub(amountToBurn));
  });
  it('should prepare distribution correctly for round 2 if only 1 USDC deposited', async () => {
    const depositAmountUSDC1 = bn(1).mul(USDC);
    await ganache.setTime(saleStartTime);

    const dxPriceFromFeed = bn(35).mul(USDC);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});

    assertBNequal(await dexe.balanceOf(user1), 0);

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, depositAmountUSDC1);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR + 1);

    await dexe.prepareDistribution(1);

    assertBNequal((await dexe.rounds(1)).roundPrice,
      (depositAmountUSDC1).div(FIRST_ROUND_SIZE));

    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2 - ONE_HOUR + 1);

    await usdcToDexeMock.setPrice(dxPriceFromFeed);
    assertBNequal(await dexe.currentPrice(), dxPriceFromFeed);

    const result = await dexe.prepareDistribution(2);

    const totalDeposited = (await dexe.rounds(2)).totalDeposited;

    // chcek if round is not fully bought
    assert.isTrue((bn(ROUND_SIZE).mul(await dexe.currentPrice()))
    .sub(totalDeposited) > 0);

    const expectedPrice = bn(31500001);

    assertBNequal((await dexe.rounds(2)).roundPrice, expectedPrice);

    const amountToBurn = bn('190475968253969261778754');

    assert.equal(result.logs[1].args.from, dexe.address);
    assert.equal(result.logs[1].args.to, ZERO_ADDRESS);
    assertBNequal(result.logs[1].args.value, amountToBurn);

    assertBNequal(await dexe.balanceOf(dexe.address), bn(99000000).mul(DEXE).sub(amountToBurn));
    assertBNequal(await dexe.totalSupply(), TOTAL_SUPPLY.mul(DEXE).sub(amountToBurn));
  });
  it('should prepare distribution correctly for round 2 if only 1.000001 USDC deposited', async () => {
    const depositAmountUSDC1 = bn(1000001);
    await ganache.setTime(saleStartTime);

    const dxPriceFromFeed = bn(35).mul(USDC);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});

    assertBNequal(await dexe.balanceOf(user1), 0);

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, depositAmountUSDC1);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR + 1);

    await dexe.prepareDistribution(1);

    // .add(1) - rounding up
    assertBNequal((await dexe.rounds(1)).roundPrice,
      ((depositAmountUSDC1).div(FIRST_ROUND_SIZE)).add(bn(1)));

    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2 - ONE_HOUR + 1);

    await usdcToDexeMock.setPrice(dxPriceFromFeed);
    assertBNequal(await dexe.currentPrice(), dxPriceFromFeed);

    const result = await dexe.prepareDistribution(2);

    const totalDeposited = (await dexe.rounds(2)).totalDeposited;

    // chcek if round is not fully bought
    assert.isTrue((bn(ROUND_SIZE).mul(await dexe.currentPrice()))
    .sub(totalDeposited) > 0);

    const expectedPrice = bn(31500001);

    assertBNequal((await dexe.rounds(2)).roundPrice, expectedPrice);

    const amountToBurn = bn('190475968253937515748016');

    assert.equal(result.logs[1].args.from, dexe.address);
    assert.equal(result.logs[1].args.to, ZERO_ADDRESS);
    assertBNequal(result.logs[1].args.value, amountToBurn);

    assertBNequal(await dexe.balanceOf(dexe.address), bn(99000000).mul(DEXE).sub(amountToBurn));
    assertBNequal(await dexe.totalSupply(), TOTAL_SUPPLY.mul(DEXE).sub(amountToBurn));
  });
  it('round should be always full with minimal deposit if price is 1/10**6 USDC', async () => {
    const depositAmountUSDC1 = bn(1).mul(USDC);
    await ganache.setTime(saleStartTime);

    const dxPriceFromFeed = bn(1);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});

    assertBNequal(await dexe.balanceOf(user1), 0);

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, depositAmountUSDC1);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR + 1);

    await dexe.prepareDistribution(1);

    assertBNequal((await dexe.rounds(1)).roundPrice,
      (depositAmountUSDC1).div(FIRST_ROUND_SIZE));

    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2 - ONE_HOUR + 1);

    await usdcToDexeMock.setPrice(dxPriceFromFeed);
    assertBNequal(await dexe.currentPrice(), dxPriceFromFeed);

    await dexe.prepareDistribution(2);

    const totalDeposited = (await dexe.rounds(2)).totalDeposited;

    // chcek if round is fully bought
    assert.isTrue((bn(ROUND_SIZE).mul(await dexe.currentPrice()))
    .sub(totalDeposited) <= 0);
  });
  it('should prepare distribution correctly for round 2 if few users deposited and price is 1/10**6 USDC', async () => {
    const depositAmountUSDC1 = bn(1).mul(USDC);
    const depositAmountUSDC2 = bn(2).mul(USDC);
    const depositAmountUSDC3 = bn(3).mul(USDC);
    await ganache.setTime(saleStartTime);

    const dxPriceFromFeed = bn(1);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user2, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    assertBNequal(await dexe.balanceOf(user1), 0);
    assertBNequal(await dexe.balanceOf(user2), 0);
    assertBNequal(await dexe.balanceOf(user3), 0);

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, depositAmountUSDC1);
    assertBNequal((await dexe.holderRounds(1, user2)).deposited, depositAmountUSDC2);
    assertBNequal((await dexe.holderRounds(1, user3)).deposited, depositAmountUSDC3);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR + 1);

    await dexe.prepareDistribution(1);

    assertBNequal((await dexe.rounds(1)).roundPrice,
      (depositAmountUSDC1.add(depositAmountUSDC2).add(depositAmountUSDC3)).div(FIRST_ROUND_SIZE));

    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2 - ONE_HOUR + 1);

    await usdcToDexeMock.setPrice(dxPriceFromFeed);
    assertBNequal(await dexe.currentPrice(), dxPriceFromFeed);

    await dexe.prepareDistribution(2);

    const totalDeposited = (await dexe.rounds(2)).totalDeposited;

    // chcek if round is fully bought
    assert.isTrue((bn(ROUND_SIZE).mul(await dexe.currentPrice()))
    .sub(totalDeposited) <= 0);

    const expectedPrice = bn(32);

    assertBNequal((await dexe.rounds(2)).roundPrice, expectedPrice);
  });
  it('should prepare distribution correctly for round 2 if few users deposited and round is sharply full', async () => {
    const depositAmountUSDC1 = bn(2000000).mul(USDC);
    const depositAmountUSDC2 = bn(857000).mul(USDC);
    const depositAmountUSDC3 = bn(140).mul(USDC);
    await ganache.setTime(saleStartTime);

    const dxPriceFromFeed = bn(15).mul(USDC);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user2, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    assertBNequal(await dexe.balanceOf(user1), 0);
    assertBNequal(await dexe.balanceOf(user2), 0);
    assertBNequal(await dexe.balanceOf(user3), 0);

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, depositAmountUSDC1);
    assertBNequal((await dexe.holderRounds(1, user2)).deposited, depositAmountUSDC2);
    assertBNequal((await dexe.holderRounds(1, user3)).deposited, depositAmountUSDC3);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR + 1);

    await dexe.prepareDistribution(1);

    assertBNequal((await dexe.rounds(1)).roundPrice,
      (depositAmountUSDC1.add(depositAmountUSDC2).add(depositAmountUSDC3)).div(FIRST_ROUND_SIZE));

    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2 - ONE_HOUR + 1);

    await usdcToDexeMock.setPrice(dxPriceFromFeed);
    assertBNequal(await dexe.currentPrice(), dxPriceFromFeed);

    await dexe.prepareDistribution(2);

    const totalDeposited = (await dexe.rounds(2)).totalDeposited;

    // chcek if round is fully bought
    assertBNequal((bn(ROUND_SIZE).mul(await dexe.currentPrice()))
    .sub(totalDeposited), 0);

    const expectedPrice = dxPriceFromFeed;

    assertBNequal((await dexe.rounds(2)).roundPrice, expectedPrice);
  });
  it('should prepare distribution correctly for round 2 if deposited much more than round size', async () => {
    const depositAmountUSDC1 = bn(40000000).mul(USDC);
    const depositAmountUSDC2 = bn(90000000).mul(USDC);
    const depositAmountUSDC3 = bn(24000).mul(USDC);
    await ganache.setTime(saleStartTime);

    const dxPriceFromFeed = bn(15).mul(USDC);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user2, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    assertBNequal(await dexe.balanceOf(user1), 0);
    assertBNequal(await dexe.balanceOf(user2), 0);
    assertBNequal(await dexe.balanceOf(user3), 0);

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, depositAmountUSDC1);
    assertBNequal((await dexe.holderRounds(1, user2)).deposited, depositAmountUSDC2);
    assertBNequal((await dexe.holderRounds(1, user3)).deposited, depositAmountUSDC3);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR + 1);

    await dexe.prepareDistribution(1);

    assertBNequal((await dexe.rounds(1)).roundPrice,
      (depositAmountUSDC1.add(depositAmountUSDC2).add(depositAmountUSDC3)).div(FIRST_ROUND_SIZE));

    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2 - ONE_HOUR + 1);

    await usdcToDexeMock.setPrice(dxPriceFromFeed);
    assertBNequal(await dexe.currentPrice(), dxPriceFromFeed);

    await dexe.prepareDistribution(2);

    const totalDeposited = (await dexe.rounds(2)).totalDeposited;

    // chcek if round is more then fully bought
    assert.isTrue((bn(ROUND_SIZE).mul(await dexe.currentPrice()))
    .sub(totalDeposited) < 0);

    const expectedPrice = bn(682626683);

    assertBNequal((await dexe.rounds(2)).roundPrice, expectedPrice);
  });
  it('should prepare distribution correctly for round 2 if deposited nothing', async () => {
    await ganache.setTime(saleStartTime);

    const dxPriceFromFeed = bn(15).mul(USDC);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user2, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);

    assertBNequal(await dexe.balanceOf(user1), 0);
    assertBNequal(await dexe.balanceOf(user2), 0);
    assertBNequal(await dexe.balanceOf(user3), 0);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR + 1);

    await dexe.prepareDistribution(1);

    assertBNequal((await dexe.rounds(1)).roundPrice, 1);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2 - ONE_HOUR + 1);

    await usdcToDexeMock.setPrice(dxPriceFromFeed);
    assertBNequal(await dexe.currentPrice(), dxPriceFromFeed);

    const result = await dexe.prepareDistribution(2);

    const totalDeposited = (await dexe.rounds(2)).totalDeposited;

    // chcek if round is not fully bought
    assert.isTrue((bn(ROUND_SIZE).mul(await dexe.currentPrice()))
    .sub(totalDeposited) > 0);

    const expectedPrice = bn(13500000);

    assertBNequal((await dexe.rounds(2)).roundPrice, expectedPrice);

    const amountToBurn = bn(ROUND_SIZE).mul(DEXE);

    assert.equal(result.logs[1].args.from, dexe.address);
    assert.equal(result.logs[1].args.to, ZERO_ADDRESS);
    assertBNequal(result.logs[1].args.value, amountToBurn);

    assertBNequal(await dexe.balanceOf(dexe.address), bn(99000000).mul(DEXE).sub(amountToBurn));
    assertBNequal(await dexe.totalSupply(), TOTAL_SUPPLY.mul(DEXE).sub(amountToBurn));
  });
  it('should add correct average price when prepared for 10th round', async () => {
    const depositAmountUSDC1 = bn(300000).mul(USDC);
    const depositAmountUSDC2 = bn(2000).mul(USDC);
    const depositAmountUSDC3 = bn(30).mul(USDC);
    await ganache.setTime(saleStartTime);

    const dxPriceFromFeed = bn(2).mul(USDC);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user2, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    assertBNequal(await dexe.balanceOf(user1), 0);
    assertBNequal(await dexe.balanceOf(user2), 0);
    assertBNequal(await dexe.balanceOf(user3), 0);

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, depositAmountUSDC1);
    assertBNequal((await dexe.holderRounds(1, user2)).deposited, depositAmountUSDC2);
    assertBNequal((await dexe.holderRounds(1, user3)).deposited, depositAmountUSDC3);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR + 1);

    await dexe.prepareDistribution(1);

    assertBNequal((await dexe.rounds(1)).roundPrice,
      (depositAmountUSDC1.add(depositAmountUSDC2).add(depositAmountUSDC3)).div(FIRST_ROUND_SIZE));

    for (let i = 2; i <= 10; i++) {
      await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
      await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
      await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * i - ONE_HOUR + 1);

      await usdcToDexeMock.setPrice(dxPriceFromFeed);
      assertBNequal(await dexe.currentPrice(), dxPriceFromFeed);

      await dexe.prepareDistribution(i);

      const totalDeposited = (await dexe.rounds(i)).totalDeposited;

      // chcek if round is not fully bought
      assert.isTrue((bn(ROUND_SIZE).mul(await dexe.currentPrice()))
      .sub(totalDeposited) > 0);

      const expectedPrice = bn(1958566);

      assertBNequal((await dexe.rounds(i)).roundPrice, expectedPrice);
    }

    const averagePrice = bn(1958566);

    assertBNequal(await dexe.averagePrice(), averagePrice);
  });
  it('should prepare distribution correctly for round 22', async () => {
    const depositAmountUSDC1 = bn(300000).mul(USDC);
    const depositAmountUSDC2 = bn(2000).mul(USDC);
    const depositAmountUSDC3 = bn(30).mul(USDC);
    await ganache.setTime(saleStartTime);

    const dxPriceFromFeed = bn(2).mul(USDC);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user2, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    assertBNequal(await dexe.balanceOf(user1), 0);
    assertBNequal(await dexe.balanceOf(user2), 0);
    assertBNequal(await dexe.balanceOf(user3), 0);

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, depositAmountUSDC1);
    assertBNequal((await dexe.holderRounds(1, user2)).deposited, depositAmountUSDC2);
    assertBNequal((await dexe.holderRounds(1, user3)).deposited, depositAmountUSDC3);

    for (let i = 1; i < 22; i++) {
      await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * i - ONE_HOUR + 1);
      await dexe.prepareDistribution(i);
    }

    assertBNequal((await dexe.rounds(1)).roundPrice,
      (depositAmountUSDC1.add(depositAmountUSDC2).add(depositAmountUSDC3)).div(FIRST_ROUND_SIZE));

    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 22 - ONE_HOUR + 1);

    await usdcToDexeMock.setPrice(dxPriceFromFeed);
    assertBNequal(await dexe.currentPrice(), dxPriceFromFeed);

    await dexe.prepareDistribution(22);

    const totalDeposited = (await dexe.rounds(22)).totalDeposited;

    // chcek if round is not fully bought
    assert.isTrue((bn(ROUND_SIZE).mul(await dexe.currentPrice()))
    .sub(totalDeposited) > 0);

    const expectedPrice = bn(1958566);

    assertBNequal((await dexe.rounds(22)).roundPrice, expectedPrice);
  });
  it('should prepare all rounds correctly after tokensale', async () => {
    const depositAmountUSDC1 = bn(300000).mul(USDC);
    const depositAmountUSDC2 = bn(2000).mul(USDC);
    const depositAmountUSDC3 = bn(30).mul(USDC);
    await ganache.setTime(saleStartTime);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user2, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    assertBNequal(await dexe.balanceOf(user1), 0);
    assertBNequal(await dexe.balanceOf(user2), 0);
    assertBNequal(await dexe.balanceOf(user3), 0);

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, depositAmountUSDC1);
    assertBNequal((await dexe.holderRounds(1, user2)).deposited, depositAmountUSDC2);
    assertBNequal((await dexe.holderRounds(1, user3)).deposited, depositAmountUSDC3);

    await ganache.setTime(saleEndTime + 1);

    await dexe.prepareDistribution(1);
    await dexe.prepareDistribution(2);

    await prepareDistributions(dexe);

    assertBNequal((await dexe.rounds(1)).roundPrice,
      (depositAmountUSDC1.add(depositAmountUSDC2).add(depositAmountUSDC3)).div(FIRST_ROUND_SIZE));

    for (let i = 2; i <= 22; i++) {
      const expectedPrice = bn(1);
      assertBNequal((await dexe.rounds(2)).roundPrice, expectedPrice);
    }
  });
  it('should prepare distribution precise with price ranges equals actual price', async () => {
    const depositAmountUSDC1 = bn(300000).mul(USDC);
    const depositAmountUSDC2 = bn(2000).mul(USDC);
    const depositAmountUSDC3 = bn(30).mul(USDC);
    await ganache.setTime(saleStartTime);

    const dxPriceFromFeed = bn(2).mul(USDC);

    await dexe.addToWhitelist(user1, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user2, USDC_LIMIT_WHITELIST);
    await dexe.addToWhitelist(user3, USDC_LIMIT_WHITELIST);
    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    assertBNequal(await dexe.balanceOf(user1), 0);
    assertBNequal(await dexe.balanceOf(user2), 0);
    assertBNequal(await dexe.balanceOf(user3), 0);

    assertBNequal((await dexe.holderRounds(1, user1)).deposited, depositAmountUSDC1);
    assertBNequal((await dexe.holderRounds(1, user2)).deposited, depositAmountUSDC2);
    assertBNequal((await dexe.holderRounds(1, user3)).deposited, depositAmountUSDC3);

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC - ONE_HOUR + 1);

    await dexe.prepareDistribution(1);

    assertBNequal((await dexe.rounds(1)).roundPrice,
      (depositAmountUSDC1.add(depositAmountUSDC2).add(depositAmountUSDC3)).div(FIRST_ROUND_SIZE));

    await dexe.depositUSDC(depositAmountUSDC1, {from: user1});
    await dexe.depositUSDC(depositAmountUSDC2, {from: user2});
    await dexe.depositUSDC(depositAmountUSDC3, {from: user3});

    await ganache.setTime(saleStartTime + ROUND_DURATION_SEC * 2 - ONE_HOUR + 1);

    await usdcToDexeMock.setPrice(dxPriceFromFeed);
    assertBNequal(await dexe.currentPrice(), dxPriceFromFeed);

    const result = await dexe.prepareDistributionPrecise(2, dxPriceFromFeed, dxPriceFromFeed);

    const totalDeposited = (await dexe.rounds(2)).totalDeposited;

    // chcek if round is not fully bought
    assert.isTrue((bn(ROUND_SIZE).mul(await dexe.currentPrice()))
    .sub(totalDeposited) > 0);

    const expectedPrice = bn(1958566);

    assertBNequal((await dexe.rounds(2)).roundPrice, expectedPrice);

    const amountToBurn = bn('36266236325965017262630');

    assert.equal(result.logs[1].args.from, dexe.address);
    assert.equal(result.logs[1].args.to, ZERO_ADDRESS);
    assertBNequal(result.logs[1].args.value, amountToBurn);

    assertBNequal(await dexe.balanceOf(dexe.address), bn(99000000).mul(DEXE).sub(amountToBurn));
    assertBNequal(await dexe.totalSupply(), TOTAL_SUPPLY.mul(DEXE).sub(amountToBurn));
  });
});
