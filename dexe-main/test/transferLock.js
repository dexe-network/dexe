const Ganache = require('./helpers/ganache');
const truffleAssert = require('truffle-assertions');
const {saleEndTime} = require('./saleConfig');
const {bn, tokenAsserts, LockType} = require('./helpers/utils');

const Dexe = artifacts.require('Dexe');
const PriceFeedMock = artifacts.require('PriceFeedMock');
const TokenMock = artifacts.require('TokenMock');

contract('TransferLock', function(accounts) {
  const ganache = new Ganache(web3);
  afterEach('revert', ganache.revert);

  const DAY = 86400;
  const DAYS = DAY;
  const DEXE = bn(10).pow(bn(18));

  const USDC = bn(1000000);

  const owner = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];

  const OWNER = 0;
  const userOne = 1;
  const userTwo = 2;

  let dexe;

  let tokenUSDCMock;
  let stateChecker;

  const prepareDistributions = async (startFromRound = 1, endRound = 22) => {
    for (let i = startFromRound; i <= endRound; i++) {
      await dexe.prepareDistribution(i);
    }
  };

  before('setup others', async function() {
    dexe = await Dexe.new(owner);
    usdcToDexeMock = await PriceFeedMock.new();

    tokenUSDCMock = await TokenMock.new();

    const helpers = tokenAsserts(dexe, accounts);
    stateChecker = helpers.stateChecker;

    await ganache.snapshot();
  });

  it('should be possible to transferLock from owner to user1', async function() {
    const {doTransferLock, doPrepareDistributions, doReceiveAll} = await stateChecker('transferLock-1');

    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await usdcToDexeMock.setPrice(DEXE.mul(USDC).mul(bn(10)).add(bn(1)));

    await ganache.setTime(saleEndTime);
    await doPrepareDistributions(1);
    await ganache.setTime(saleEndTime);
    await doReceiveAll(OWNER);
    await ganache.setTime(saleEndTime);
    await doReceiveAll(userOne);

    await ganache.setTime(saleEndTime);
    await doTransferLock(OWNER, LockType.Foundation, userOne, 10000000);
  });
  it('should NOT be possible to transferLock from user1 to user2 after release', async function() {
    const {doTransferLock, doPrepareDistributions, doReceiveAll, doRelease} = await stateChecker('transferLock-2');

    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await usdcToDexeMock.setPrice(DEXE.mul(USDC).mul(bn(10)).add(bn(1)));

    await ganache.setTime(saleEndTime);
    await doPrepareDistributions(1);
    await ganache.setTime(saleEndTime);
    await doReceiveAll(OWNER);
    await ganache.setTime(saleEndTime);
    await doReceiveAll(userOne);

    await ganache.setTime(saleEndTime);
    await doTransferLock(OWNER, LockType.Team, userOne, 10000000);

    await ganache.setTime(saleEndTime + 180 * DAYS + 50);
    await doRelease(userOne, LockType.Team);

    await truffleAssert.reverts(dexe.transferLock(LockType.Team, accounts[userTwo], 1, {from: accounts[userOne]}),
      'Cannot transfer after release');
  });
  it('should NOT be possible to transferLock Staking from user1 to user2 after forceRelease', async function() {
    const {doTransferLock, doPrepareDistributions, doReceiveAll, doForceRelease} =
      await stateChecker('transferLock-3');

    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await usdcToDexeMock.setPrice(DEXE.mul(USDC).mul(bn(10)).add(bn(1)));

    await ganache.setTime(saleEndTime);
    await doPrepareDistributions(1);
    await ganache.setTime(saleEndTime);
    await doReceiveAll(OWNER);
    await ganache.setTime(saleEndTime);
    await doReceiveAll(userOne);

    await ganache.setTime(saleEndTime);
    await doTransferLock(OWNER, LockType.Staking, userOne, 10000000);

    await ganache.setTime(saleEndTime + 180 * DAYS + 50);
    await usdcToDexeMock.setPrice((await dexe.averagePrice()).mul(bn(10)));
    await ganache.setTime(saleEndTime + 180 * DAYS + 50);
    await doForceRelease(userOne, 0);

    await truffleAssert.reverts(dexe.transferLock(LockType.Staking, accounts[userTwo], 1, {from: accounts[userOne]}),
      'Cannot transfer after release');
  });
  it('should be possible to transferLock from user1 to user2 all exept one coin after vesting finished and then release 1 coin', async function() {
    const {doTransferLock, doPrepareDistributions, doReceiveAll, doRelease} = await stateChecker('transferLock-4');

    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await usdcToDexeMock.setPrice(DEXE.mul(USDC).mul(bn(10)).add(bn(1)));

    await ganache.setTime(saleEndTime);
    await doPrepareDistributions(1);
    await ganache.setTime(saleEndTime);
    await doReceiveAll(OWNER);
    await ganache.setTime(saleEndTime);
    await doReceiveAll(userOne);

    await ganache.setTime(saleEndTime);
    await doTransferLock(OWNER, LockType.Marketing, userOne, 10000000);

    await ganache.setTime(saleEndTime + 395 * DAYS + 1);
    await doTransferLock(userOne, LockType.Marketing, userTwo, 9999999);

    await ganache.setTime(saleEndTime + 395 * DAYS + 1);
    await doRelease(userOne, LockType.Marketing);
  });
  it('should not be possible to transferLock more than locked', async function() {
    await dexe.setDEXEFeed(usdcToDexeMock.address);
    await dexe.setUSDCTokenAddress(tokenUSDCMock.address);
    await usdcToDexeMock.setPrice(DEXE.mul(USDC).mul(bn(10)).add(bn(1)));

    await ganache.setTime(saleEndTime);
    await prepareDistributions(1);
    await ganache.setTime(saleEndTime);
    await dexe.receiveAll();
    await ganache.setTime(saleEndTime);
    await dexe.receiveAll({from: user1});

    await ganache.setTime(saleEndTime);
    await dexe.transferLock(LockType.Team, user1, 10000000);

    await truffleAssert.reverts(dexe.transferLock(LockType.Team, user2, 10000000 + 1, {from: user1}),
      'Insuffisient locked funds');
  });
});
