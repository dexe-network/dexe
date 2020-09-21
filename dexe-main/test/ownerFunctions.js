const Ganache = require('./helpers/ganache');
const truffleAssert = require('truffle-assertions');
const {bn} = require('./helpers/utils');

const Dexe = artifacts.require('Dexe');

contract('Owner functions', function(accounts) {
  const ganache = new Ganache(web3);
  afterEach('revert', ganache.revert);

  const user1 = accounts[1];
  const user2 = accounts[2];
  const USDC_LIMIT_WHITELIST = bn('5000000000000000');

  let dexe;

  before('setup others', async function() {
    dexe = await Dexe.new(accounts[0]);
    await ganache.snapshot();
  });
  it('should not be possible to call setUSDTTokenAddress by not owner', async () => {
    await truffleAssert.reverts(dexe.setUSDTTokenAddress(user2, {from: user1}),
      'Ownable: caller is not the owner.');
  });
  it('should not be possible to call setUSDCTokenAddress by not owner', async () => {
    await truffleAssert.reverts(dexe.setUSDCTokenAddress(user2, {from: user1}),
      'Ownable: caller is not the owner.');
  });
  it('should not be possible to call setUSDTFeed by not owner', async () => {
    await truffleAssert.reverts(dexe.setUSDTFeed(user2, {from: user1}),
      'Ownable: caller is not the owner.');
  });
  it('should not be possible to call setDEXEFeed by not owner', async () => {
    await truffleAssert.reverts(dexe.setDEXEFeed(user2, {from: user1}),
      'Ownable: caller is not the owner.');
  });
  it('should not be possible to call setETHFeed by not owner', async () => {
    await truffleAssert.reverts(dexe.setETHFeed(user2, {from: user1}),
      'Ownable: caller is not the owner.');
  });
  it('should not be possible to call setTreasury by not owner', async () => {
    await truffleAssert.reverts(dexe.setTreasury(user2, {from: user1}),
      'Ownable: caller is not the owner.');
  });
  it('should not be possible to call addToWhitelist by not owner', async () => {
    await truffleAssert.reverts(dexe.addToWhitelist(user2, USDC_LIMIT_WHITELIST, {from: user1}),
      'Ownable: caller is not the owner.');
  });
  it('should not be possible to call removeFromWhitelist by not owner', async () => {
    await truffleAssert.reverts(dexe.removeFromWhitelist(user2, {from: user1}),
      'Ownable: caller is not the owner.');
  });
  it('should not be possible to prepareDistribution by no owner', async () => {
    await truffleAssert.reverts(dexe.prepareDistribution(1, {from: user1}),
      'Ownable: caller is not the owner.');
  });
  it('should not be possible to call prepareDistributionPrecise by not owner', async () => {
    await truffleAssert.reverts(dexe.prepareDistributionPrecise(user2, 0, 0, {from: user1}),
      'Ownable: caller is not the owner.');
  });
  it('should not be possible to call launchProduct by not owner', async () => {
    await truffleAssert.reverts(dexe.launchProduct({from: user1}),
      'Ownable: caller is not the owner.');
  });
  it('should not allow to withdraw locked by not owner', async () => {
    await truffleAssert.reverts(dexe.withdrawLocked(user2, user1, 100, {from: user1}),
      'Ownable: caller is not the owner.');
  });
});
