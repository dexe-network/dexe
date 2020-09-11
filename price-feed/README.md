# dexe-price-feed

# Uniswap price feed for Dexe

# Installation

**NodeJS 12.x+ must be installed as a prerequisite.**

```
$ npm install
```

# Running tests

Sometimes some tests might fail due to ganache slipping the time 1 second forward.

```
$ npm run ganache
$ npm run test
```

# Contributing ![JS Code Style](https://img.shields.io/badge/js--style-extends--google-green.svg 'JS Code Style') ![Solidity Code Style](https://img.shields.io/badge/sol--style-ambisafe-red.svg 'Solidity Code Style')

In order to validate consistency of your changes run:

```
$ npm run validate
```

## Code Style

JS: based on Google, though with only single indentations even for arguments.

Solidity: based on solhint default, though with some rules disabled.
