const Ganache = require('./helpers/ganache');
// const truffleAssert = require('truffle-assertions');

const Dexe = artifacts.require('Dexe');

contract('Dexe', function(accounts) {
  const ganache = new Ganache(web3);
  afterEach('revert', ganache.revert);

  const bn = (input) => web3.utils.toBN(input);
  const assertBNequal = (bnOne, bnTwo) => assert.equal(bnOne.toString(), bnTwo.toString());

  const name = 'Dexe';
  const symbol = 'DEXE';
  const decimals = 18;

  let dexe;

  before('setup others', async function() {
    dexe = await Dexe.new(accounts[0]);

    await ganache.snapshot();
  });

  it('should set default owner after contract deploy', async function() {
    assert.equal(await dexe.owner(), accounts[0]);
  });

  it('should set name, symbol and default decimals = 18 after contract deploy', async function() {
    assert.equal(await dexe.name(), name);
    assert.equal(await dexe.symbol(), symbol);
    assert.equal(await dexe.decimals(), decimals);
  });

  it('should have default 0 total supply', async function() {
    assertBNequal(await dexe.totalSupply(), bn('100000000').mul(bn('1000000000000000000')));
  });
});
