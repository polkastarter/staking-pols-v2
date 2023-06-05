# Staking Contract v2 with Time-based Rewards

## Overview

This repo implements a basic staking contract with some added functionality for stake-time based rewards.

This staking contract shall eventually be the basis for an improved incentive mechanism for a rewards-based lottery ticket allocation.

---

## Deployment Parameter

At time of deployment, the contract address of the token which can be staked needs to be provided as well as the time (in seconds) the staked token shall be locked.

After deployment, (optionally) a ERC20 rewards token can be set and "reward tokens" provided to the contract, which can be claimed later by the users.

---

## User functions (Basic features)

### stake(amount)

Deposit the specified amount of POLS token into the staking contract. In our context POLS is the "staking token".

The user has to approve POLS token first by calling the `approve()` function on the POLS ERC20 token contract, before he can call the stake function.

Every time a user stakes token, either for the first time or adding tokens later, a new lockTimePeriod starts.

The `unlockTime` will be calculcalted at the time of staking (current time + `lockTimePeriod`) and stored for every user individually.

### stakeAmount_msgSender() returns (uint256 amount)

Returns the amount of staked token (POLS) for `msg.sender`

### stakeTime_msgSender() returns (uint time)

Returns the unix epoch time (in seconds) when the user executed a transaction (stake or unstake) the last time.

### getUnlockTime_msgSender returns (uint time)

Returns the time when the user's token will be unlocked and can be withdrawn.

### withdraw(uint256 amount) returns (uint256 amount)

If `lockTimePeriod` had been set, this time period has to be expired since the last `stake` transaction, before the staked tokens can be withdrawn.

There is no need for the user to explicitly 'unlock' the staked token, they will 'automatically' be unlocked after the `lockTimePeriod` expired.

`withdraw(amount)`, return `amount` staked tokens to the user's account.

The lock period will not be extended, unlock time will stay unchanged.

All rewards will stay within the contract.

### withdrawAll() returns (uint256 amount)

As `withdraw(amount)`, but all staked tokens will be returned to the user's account.

---

## User Reward functions

While the user has staked token, 'internal rewards' are being earned.

`stakeRewardEndTime` defines the time when reward scheme ends and no more 'internal rewards' are being earned for staking token.

### userClaimableRewards_msgSender() returns (uint256 amount)

Over time the user earns 'internal rewards' which are (to begin with) only tracked internally within the contract.
`userClaimableRewards` is the ongoing reward allocation = amount of staked token \* the time since the last stake/unstake transaction was executed.

### userAccumulatedRewards_msgSender() returns (uint256 amount)

Whenever the staking amount changes, the past earned rewards (= `userClaimableRewards`) are being added to `userAccumulatedRewards`. Then the `stakeTime` is reset to the current time, and `userClaimableRewards` are being calculated anew based on the new time period \* new staked token amount.

### userTotalRewards_msgSender() returns (uint256 amount)

`userTotalRewards` is just the sum of `userAccumulatedRewards` and `userClaimableRewards`

### claim()

Calculates the amount of reward tokens for `msg.sender` based on `userTotalRewards / stakeRewardFactor`.

If enough reward tokens are within the contract, the 'reward tokens' are being transferred to the account of `msg.sender`.

After `claim` all 'internal rewards' have been converted to reward tokens and `userAccumulatedRewards` as well as `userClaimableRewards` will be 0 thereafter.

---

## Admin functions

The deployer account is being assigned the `DEFAULT_ADMIN_ROLE` which is allowed to execute various administrative functions.

### setLockTimePeriod(uint48 \_lockTimePeriod)

Sets the time (in seconds) a user has to wait after the last stake transaction until he can withdraw the staked tokens.

`lockTimePeriod` can be changed any time and there are no restrictions to the value.

As `unlockTime` will be calculcalted at the time of staking (current time + `lockTimePeriod`) and stored for every user individually, `lockTimePeriod` can be changed while users have staked token, but it will only affect stakes after `lockTimePeriod` has been changed.

### setRewardToken(address)

Specify the contract address of a ERC20 reward token.

Setting it to `address(0)` (obviously) prevents user from claiming reward tokens.

If the contract holds an amoun of a previous rewards token, that amount will be transferred to the `msg.sender` who has to own the `DEFAULT_ADMIN_ROLE`.

If the previous rewards token is identical to the staking token, then only the difference between the contract balance and the total staked amount is returned.

### setStakeRewardFactor(uint256)

The 'internal rewards' are just accumulated `stakeAmount` \* `stakeTime`.

Example 1000 POLS token staked for 1 day : 1000 \* 24 \* 60 \* 60 = 604800000

(This example assumes that stake token uses the same decimals as reward token, otherwise it has to be accounted for when setting `stakeRewardFactor`.)

If this value is being set as `setStakeRewardFactor` then a user will able to claim/mint 1 reward token after staking 1000 staking token for 1 week.

A user would also be able to claim/mint 1 reward token after staking 7000 staking token for 1 day.

### setStakeRewardEndTime(uint48 time)

Set the time when the reward scheme ends and no more 'internal rewards' are being earned for staking token.

---

### External Contract functions

### burnRewards(address from, uint256 amount) public onlyRole(BURNER_ROLE)

`burnRewards()` allows an external contract which has been assigned the `BURNER_ROLE` to subtract a certain amount of 'internal rewards' of a specified account.

This would allow the token sale contract to reduce the amount of 'internal rewards' of a user who was successful to claim a token allocation.
If the probability to win the token lottery is based on the 'internal rewards', burning internal rewards can be used to setup a mechnism to decrease the chance of a user to win again who just won and received a token allocation.

===============================================================================

# Project Setup

The Solidity template from [@paulrberg](https://github.com/paulrberg) was used to initialize this project.

https://github.com/paulrberg/solidity-template

## Hardhat Template [![Open in Gitpod][gitpod-badge]][gitpod] [![Github Actions][gha-badge]][gha] [![Hardhat][hardhat-badge]][hardhat] [![License: MIT][license-badge]][license]

[gitpod]: https://gitpod.io/#https://github.com/paulrberg/hardhat-template
[gitpod-badge]: https://img.shields.io/badge/Gitpod-Open%20in%20Gitpod-FFB45B?logo=gitpod
[gha]: https://github.com/paulrberg/hardhat-template/actions
[gha-badge]: https://github.com/paulrberg/hardhat-template/actions/workflows/ci.yml/badge.svg
[hardhat]: https://hardhat.org/
[hardhat-badge]: https://img.shields.io/badge/Built%20with-Hardhat-FFDB1C.svg
[license]: https://opensource.org/licenses/MIT
[license-badge]: https://img.shields.io/badge/License-MIT-blue.svg

A Hardhat-based template for developing Solidity smart contracts, with sensible defaults.

- [Hardhat](https://github.com/nomiclabs/hardhat): compile, run and test smart contracts
- [TypeChain](https://github.com/ethereum-ts/TypeChain): generate TypeScript bindings for smart contracts
- [Ethers](https://github.com/ethers-io/ethers.js/): renowned Ethereum library and wallet implementation
- [Solhint](https://github.com/protofire/solhint): code linter
- [Solcover](https://github.com/sc-forks/solidity-coverage): code coverage
- [Prettier Plugin Solidity](https://github.com/prettier-solidity/prettier-plugin-solidity): code formatter

## Getting Started

Click the [`Use this template`](https://github.com/paulrberg/hardhat-template/generate) button at the top of the page to
create a new repository with this repo as the initial state.

## Features

This template builds upon the frameworks and libraries mentioned above, so for details about their specific features,
please consult their respective documentations.

For example, for Hardhat, you can refer to the [Hardhat Tutorial](https://hardhat.org/tutorial) and the
[Hardhat Docs](https://hardhat.org/docs). You might be in particular interested in reading the
[Testing Contracts](https://hardhat.org/tutorial/testing-contracts) section.

### Sensible Defaults

This template comes with sensible default configurations in the following files:

```text
├── .editorconfig
├── .eslintignore
├── .eslintrc.yml
├── .gitignore
├── .prettierignore
├── .prettierrc.yml
├── .solcover.js
├── .solhint.json
└── hardhat.config.ts
```

### VSCode Integration

This template is IDE agnostic, but for the best user experience, you may want to use it in VSCode alongside Nomic
Foundation's [Solidity extension](https://marketplace.visualstudio.com/items?itemName=NomicFoundation.hardhat-solidity).

### GitHub Actions

This template comes with GitHub Actions pre-configured. Your contracts will be linted and tested on every push and pull
request made to the `main` branch.

Note though that to make this work, you must use your `INFURA_API_KEY` and your `MNEMONIC` as GitHub secrets.

You can edit the CI script in [.github/workflows/ci.yml](./.github/workflows/ci.yml).

## Usage

### Pre Requisites

Before being able to run any command, you need to create a `.env` file and set a BIP-39 compatible mnemonic as an
environment variable. You can follow the example in `.env.example`. If you don't already have a mnemonic, you can use
this [website](https://iancoleman.io/bip39/) to generate one.

Then, proceed with installing dependencies:

```sh
$ pnpm install
```

### Compile

Compile the smart contracts with Hardhat:

```sh
$ pnpm compile
```

### TypeChain

Compile the smart contracts and generate TypeChain bindings:

```sh
$ pnpm typechain
```

### Test

Run the tests with Hardhat:

```sh
$ pnpm test
```

### Lint Solidity

Lint the Solidity code:

```sh
$ pnpm lint:sol
```

### Lint TypeScript

Lint the TypeScript code:

```sh
$ pnpm lint:ts
```

### Coverage

Generate the code coverage report:

```sh
$ pnpm coverage
```

### Report Gas

See the gas usage per unit test and average gas per method call:

```sh
$ REPORT_GAS=true pnpm test
```

### Clean

Delete the smart contract artifacts, the coverage reports and the Hardhat cache:

```sh
$ pnpm clean
```

### Deploy

Deploy the contracts to Hardhat Network:

```sh
$ pnpm deploy:contracts"
```

### Tasks

#### Deploy Greeter

Deploy a new instance of the Greeter contract via a task:

```sh
$ pnpm task:deployGreeter --network ganache --greeting "Bonjour, le monde!"
```

#### Set Greeting

Run the `setGreeting` task on the Ganache network:

```sh
$ pnpm task:setGreeting --network ganache --greeting "Bonjour, le monde!" --account 3
```

## Tips

### Syntax Highlighting

If you use VSCode, you can get Solidity syntax highlighting with the
[hardhat-solidity](https://marketplace.visualstudio.com/items?itemName=NomicFoundation.hardhat-solidity) extension.

## Using GitPod

[GitPod](https://www.gitpod.io/) is an open-source developer platform for remote development.

To view the coverage report generated by `pnpm coverage`, just click `Go Live` from the status bar to turn the server
on/off.

## Local development with Ganache

### Install Ganache

```sh
$ npm i -g ganache
```

### Run a Development Blockchain

```sh
$ ganache -s test
```

> The `-s test` passes a seed to the local chain and makes it deterministic

Make sure to set the mnemonic in your `.env` file to that of the instance running with Ganache.

## License

This project is licensed under MIT.
