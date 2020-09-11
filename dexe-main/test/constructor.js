const Ganache = require('./helpers/ganache');
const {bn, assertBNequal, LockType} = require('./helpers/utils');
const {saleEndTime} = require('./saleConfig');

const Dexe = artifacts.require('Dexe');
const PriceFeedMock = artifacts.require('PriceFeedMock');
const TokenMock = artifacts.require('TokenMock');


contract('Constructor', function(accounts) {
  const ganache = new Ganache(web3);
  afterEach('revert', ganache.revert);

  const ROUND_DURATION_SEC = 86400;

  const TOTAL_SUPPLY = bn(100000000);
  const DEXE = bn(10).pow(bn(18));
  const owner = accounts[0];

  const stackingLockAmount = TOTAL_SUPPLY.mul(DEXE).mul(bn(10)).div(bn(100));
  const foundationLockAmount = TOTAL_SUPPLY.mul(DEXE).mul(bn(33)).div(bn(100));
  const teamLockAmount = TOTAL_SUPPLY.mul(DEXE).mul(bn(20)).div(bn(100));
  const partnershipLockAmount = TOTAL_SUPPLY.mul(DEXE).mul(bn(16)).div(bn(100));
  const schoolLockAmount = TOTAL_SUPPLY.mul(DEXE).mul(bn(10)).div(bn(100));
  const marketingLockAmount = TOTAL_SUPPLY.mul(DEXE).mul(bn(5)).div(bn(100));
  const liquidityFundAmount = TOTAL_SUPPLY.mul(DEXE).mul(bn(1)).div(bn(100));
  const publicSaleAmount = TOTAL_SUPPLY.mul(DEXE).mul(bn(5)).div(bn(100));

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

    await ganache.snapshot();
  });

  it('should set default locks on owner account after contract deploy', async function() {
    assertBNequal(
      (await dexe.locks(LockType.Staking, dexe.address)).balance,
      stackingLockAmount,
    );
    assertBNequal(
      (await dexe.locks(LockType.Foundation, owner)).balance,
      foundationLockAmount,
    );
    assertBNequal(
      (await dexe.locks(LockType.Team, owner)).balance,
      teamLockAmount,
    );
    assertBNequal(
      (await dexe.locks(LockType.Partnership, owner)).balance,
      partnershipLockAmount,
    );
    assertBNequal(
      (await dexe.locks(LockType.School, owner)).balance,
      schoolLockAmount,
    );
    assertBNequal(
      (await dexe.locks(LockType.Marketing, owner)).balance,
      marketingLockAmount,
    );
  });

  it('should have 94% of locked tokens owner/token address', async function() {
    totalLockedTokensActual = (await dexe.locks(LockType.Staking, dexe.address)).balance
    .add((await dexe.locks(LockType.Foundation, owner)).balance)
    .add((await dexe.locks(LockType.Team, owner)).balance)
    .add((await dexe.locks(LockType.Partnership, owner)).balance)
    .add((await dexe.locks(LockType.School, owner)).balance)
    .add((await dexe.locks(LockType.Marketing, owner)).balance);

    totalLockedTokensActualExpected = TOTAL_SUPPLY.mul(DEXE)
    .sub(liquidityFundAmount)
    .sub(publicSaleAmount);

    assertBNequal(
      totalLockedTokensActual,
      totalLockedTokensActualExpected,
    );
  });

  it('should mint all tokens in constructor and transfer all tokens to the token address', async function() {
    assertBNequal(
      await dexe.balanceOf(dexe.address),
      TOTAL_SUPPLY.mul(DEXE).sub(liquidityFundAmount),
    );

    assertBNequal(
      await dexe.balanceOf(owner),
      liquidityFundAmount,
    );

    assertBNequal(
      await dexe.totalSupply(),
      TOTAL_SUPPLY.mul(DEXE),
    );
  });

  it('should set default treasury in constructor', async function() {
    assertBNequal(
      await dexe.treasury(),
      owner,
    );
  });

  it('should set correct dates of cliff and vesting for each lock type', async function() {
    const saleEnd = saleEndTime - 1;

    assertBNequal(
      (await dexe.lockConfigs(LockType.Staking)).releaseStart,
      saleEnd,
    );
    assertBNequal(
      (await dexe.lockConfigs(LockType.Staking)).vesting,
      ROUND_DURATION_SEC * 365,
    );

    assertBNequal(
      (await dexe.lockConfigs(LockType.Foundation)).releaseStart,
      saleEnd + ROUND_DURATION_SEC * 365,
    );
    assertBNequal(
      (await dexe.lockConfigs(LockType.Foundation)).vesting,
      ROUND_DURATION_SEC * 365 * 4,
    );

    assertBNequal(
      (await dexe.lockConfigs(LockType.Team)).releaseStart,
      saleEnd + ROUND_DURATION_SEC * 180,
    );
    assertBNequal(
      (await dexe.lockConfigs(LockType.Team)).vesting,
      ROUND_DURATION_SEC * 365 * 2,
    );

    assertBNequal(
      (await dexe.lockConfigs(LockType.Partnership)).releaseStart,
      saleEnd + ROUND_DURATION_SEC * 90,
    );
    assertBNequal(
      (await dexe.lockConfigs(LockType.Partnership)).vesting,
      ROUND_DURATION_SEC * 365,
    );

    assertBNequal(
      (await dexe.lockConfigs(LockType.School)).releaseStart,
      saleEnd + ROUND_DURATION_SEC * 60,
    );
    assertBNequal(
      (await dexe.lockConfigs(LockType.School)).vesting,
      ROUND_DURATION_SEC * 365,
    );

    assertBNequal(
      (await dexe.lockConfigs(LockType.Marketing)).releaseStart,
      saleEnd + ROUND_DURATION_SEC * 30,
    );
    assertBNequal(
      (await dexe.lockConfigs(LockType.Marketing)).vesting,
      ROUND_DURATION_SEC * 365,
    );
  });
});
