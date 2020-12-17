const Promise = require('bluebird');
const BigNumber = require('bignumber.js');
const Web3 = require('web3');
const web3 = new Web3(process.argv.slice(2)[0]);

const retry = (fun, delay) => fun().catch(err => Promise.delay(delay).then(() => retry(fun, delay)));

// https://explore.duneanalytics.com/queries/1209/source#2063 execute to get data needed to build a list of all Dexe holders.
// Current file contains all holders as of 07 December 2020.
const allDexeHolders = require('./Dexe.Holders.json').map(address => address.toLowerCase());

const DEXE_UI_ADDRESS = '0xaa6c61bc850e7a4ecb99d0251b9068c0cbb24aea';
const DEXE_ADDRESS = '0xde4ee8057785a7e8e800db58f9784845a5c2cbd6';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const USDC_DEXE_UNISWAP_ADDRESS = '0x308ecf08955f6ff0a48011561f37a1f570580abe';
const MAX_STAKING_REWARDS = '10000000';

const dexeUI = new web3.eth.Contract([{"inputs":[{"internalType":"address","name":"_holder","type":"address"}],"name":"holderClaimableBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}], DEXE_UI_ADDRESS);
const dexe = new web3.eth.Contract([{"inputs":[{"internalType":"enum Dexe.LockType","name":"","type":"uint8"},{"internalType":"address","name":"","type":"address"}],"name":"locks","outputs":[{"internalType":"uint128","name":"balance","type":"uint128"},{"internalType":"uint128","name":"released","type":"uint128"}],"stateMutability":"view","type":"function"}], DEXE_ADDRESS);

const wrapper = async () => {
  console.log('This may take a while, depending on how fast your Ethereum node is.');
  const dexeHoldersData = await Promise.map(allDexeHolders, async (holder) => ({holder, claimable: await retry(async () => (await dexeUI.methods.holderClaimableBalance(holder).call())[1], 500), lock: await retry(async () => (await dexe.methods.locks(0, holder).call())[0], 500)}), {concurrency: 10});
  // dexeHolderData will contain
  // {
  //   holder,    // address
  //   claimable, // how much staking rewards allocated but not claimed yet by the holder
  //   lock,      // how much staking rewards already claimed by the holder
  // }
  // The sum of claimable and lock of every holder is the total allocated staking rewards.
  // We exclude claimed staking rewards allocated for addresses that cannot release them.
  const allocatedButNotYetClaimedStakeRewards = web3.utils.fromWei(dexeHoldersData.reduce((total, next) => total.plus(next.claimable), BigNumber(0)).toFixed());
  const claimedStakeRewards = web3.utils.fromWei(
    dexeHoldersData.filter(el => el.holder != DEXE_ADDRESS && el.holder != ZERO_ADDRESS && el.holder != USDC_DEXE_UNISWAP_ADDRESS)
    .reduce((total, next) => total.plus(next.lock), BigNumber(0)).toFixed()
  );
  console.log(BigNumber(MAX_STAKING_REWARDS).minus(allocatedButNotYetClaimedStakeRewards).minus(claimedStakeRewards).toFixed(), 'DEXE will never be released from staking rewards.');
};

wrapper();
