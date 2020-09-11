// web3 is inited in truffle
const bn = (input) => web3.utils.toBN(input);
const assertBNequal = (bnOne, bnTwo, message) => assert.equal(bnOne.toString(), bnTwo.toString(), message);

module.exports = {
  bn,
  assertBNequal,
};
