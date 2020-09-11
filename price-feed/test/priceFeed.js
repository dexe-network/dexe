const Ganache = require('./helpers/ganache');
const PriceFeed = artifacts.require('PriceFeed');
const PairMock = artifacts.require('PairMock');
const ERC20Mock = artifacts.require('ERC20Mock');

const {bn, assertBNequal} = require('./helpers/utils');

contract('PriceFeed', async () => {
  const ganache = new Ganache(web3);
  let priceFeed;
  let pairMock;
  let erc20Mock;

  before('setup', async () => {
    erc20Mock = await ERC20Mock.new();
    pairMock = await PairMock.new();
  });

  describe('Creation', async () => {
    it('should set all values correctly', async () => {
      await pairMock.setReserves(100, 100);
      await pairMock.setToken1(erc20Mock.address);
      await erc20Mock.setDecimals(18);
      await pairMock.setPriceCumulativeLast(4000);

      priceFeed = await PriceFeed.new(pairMock.address);

      assert.equal(await priceFeed.pair(), pairMock.address);
      assertBNequal(await priceFeed.multiplier(), bn(10**18));
      assertBNequal(await priceFeed.priceCumulativeLast(), bn(4000));
    });
  });

  describe('Price tests', async () => {
    it('Should calculate USDT price correctly', async () => {
      await pairMock.setReserves(100, 100);
      await pairMock.setToken1(erc20Mock.address);
      await erc20Mock.setDecimals(6);
      await pairMock.setPriceCumulativeLast(0);

      priceFeed = await PriceFeed.new(pairMock.address);

      pairMock.setBlockTimestampLast(bn('1598790698'));

      await pairMock.setPriceCumulativeLast(bn('46473110283122957345697278473167575127549'));

      await ganache.setTime(1598790698);
      await priceFeed.update();

      await pairMock.setBlockTimestampLast(bn('1598790732'));

      await pairMock.setPriceCumulativeLast('46473286020074617833567897572689103906127');

      pairMock.setBlockTimestampLast(bn('1598790732'));

      await ganache.setTime(1598790732);
      const resultPrice = await priceFeed.updateAndConsult.call();
      await ganache.setTime(1598790732);
      await priceFeed.updateAndConsult();

      assertBNequal(resultPrice, bn('995461'));
    });
    it('Should calculate ETH price correctly', async () => {
      await pairMock.setReserves(100, 100);
      await pairMock.setToken1(erc20Mock.address);
      await erc20Mock.setDecimals(18);
      await pairMock.setPriceCumulativeLast(0);

      priceFeed = await PriceFeed.new(pairMock.address);

      pairMock.setBlockTimestampLast(bn('1598792340'));

      await pairMock.setPriceCumulativeLast(bn('14435534432522184191220817556046'));

      await ganache.setTime(1598792340);
      await priceFeed.update();

      await pairMock.setBlockTimestampLast(bn('1598792386'));

      await pairMock.setPriceCumulativeLast('14435631746647623403498278542260');

      pairMock.setBlockTimestampLast(bn('1598792386'));

      await ganache.setTime(1598792386);
      const resultPrice = await priceFeed.updateAndConsult.call();
      await ganache.setTime(1598792386);
      await priceFeed.updateAndConsult();

      assertBNequal(resultPrice, bn('407435191'));
    });
    it('Should calculate DX price correctly', async () => {
      await pairMock.setReserves(100, 100);
      await pairMock.setToken1(erc20Mock.address);
      await erc20Mock.setDecimals(18);
      await pairMock.setPriceCumulativeLast(0);

      priceFeed = await PriceFeed.new(pairMock.address);

      pairMock.setBlockTimestampLast(bn('1598792343'));

      await pairMock.setPriceCumulativeLast(bn('49174834747402572377235421714'));

      await ganache.setTime(1598792343);
      await priceFeed.update();

      await pairMock.setBlockTimestampLast(bn('1598793612'));

      await pairMock.setPriceCumulativeLast('49181507719882512079386278689');

      pairMock.setBlockTimestampLast(bn('1598793612'));

      await ganache.setTime(1598793612);
      const resultPrice = await priceFeed.updateAndConsult.call();
      await ganache.setTime(1598793612);
      await priceFeed.updateAndConsult();

      assertBNequal(resultPrice, bn('1012740'));
    });
    it('Should calculate DX price correctly with different reserves', async () => {
      await pairMock.setReserves(100, 100);
      await pairMock.setToken1(erc20Mock.address);
      await erc20Mock.setDecimals(18);
      await pairMock.setPriceCumulativeLast(0);

      priceFeed = await PriceFeed.new(pairMock.address);

      pairMock.setBlockTimestampLast(bn('1598795462'));
      await pairMock.setPriceCumulativeLast(bn('14442200536244164839854001008872'));

      await ganache.setTime(1598795462);
      await priceFeed.update();

      await pairMock.setPriceCumulativeLast('14442288559934790659918572310925');

      await pairMock.setReserves(bn('32468490882985'), bn('78534113820479501023627'));

      await ganache.setTime(1598795503);
      const resultPrice = await priceFeed.updateAndConsult.call();
      await ganache.setTime(1598795503);
      await priceFeed.updateAndConsult();

      assertBNequal(resultPrice, bn('826913297'));
    });
  });
});
