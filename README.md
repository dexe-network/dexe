# dexe

# Dexe

Actions order:
```
Update tokensaleStartDate date constant in Dexe and compile.
Deploy Dexe specifying the Distributor, deployed address should be starting with 0xde4e, or atleast 0xb.
Update Treasury, optional.
Set USDC address in Dexe.
Set USDT address in Dexe.
Deploy PriceFeed for USDT.
Deploy PriceFeed for ETH.
Set USDT PriceFeed in Dexe.
Set ETH PriceFeed in Dexe.
Add to whitelist in Dexe, optional.
Wait for 23 hours after sale start.
Prepare distribution for Round 1 in Dexe.
Deploy Uniswap USDC/DEXE pair with liquidity.
Deploy PriceFeed for DEXE.
Wait for 23 hours after Round 1.
Prepare distribution precisely for Round 2 in Dexe.
Repeat for all 22 rounds.
Wait for the product launch.
Launch product in Dexe.
```

# Contributing ![JS Code Style](https://img.shields.io/badge/js--style-extends--google-green.svg 'JS Code Style') ![Solidity Code Style](https://img.shields.io/badge/sol--style-ambisafe-red.svg 'Solidity Code Style')

Before commiting anything, install a pre-commit hook:

```
$ cp pre-commit .git/hooks/ && chmod a+x .git/hooks/pre-commit
```

## Code Style

JS: based on Google, though with only single indentations even for arguments.

Solidity: based on solhint default, though with some rules disabled.
