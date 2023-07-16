import { ethers, network } from "hardhat";

// https://www.chaijs.com/guide/styles/#expect
// https://www.chaijs.com/api/bdd/
// https://ethereum-waffle.readthedocs.io/en/latest/matchers.html
import { expect } from "chai";
import * as path from "path";

import { BigNumberish } from "ethers";
import { Logger } from "@ethersproject/logger";
import { toUtf8Bytes } from "ethers/lib/utils";

const DECIMALS: number = 18;
const DECMULBN: bigint = 10n ** BigInt(DECIMALS);
const STAKE_AMOUNT: bigint = 1000n * DECMULBN; // 1000 token

const STAKE_AMOUNT_MAX = 50000n * DECMULBN; // 50000 token
const TIMEOUT_BLOCKCHAIN_ms: number = 10 * 60 * 1000; // 10 minutes

const abs = (n: bigint) => (n === -0n || n < 0n) ? -n : n;

export function shouldBehaveLikeStakeV2(_timePeriod: number): void {
  const timePeriod = _timePeriod;
  console.log("timePeriod =", timePeriod, "seconds");

  const stakeRewardFactor = 1 * timePeriod * 1000; // 1 reward token for staking 1000 stake token for 1 period
  const LOCK_TIME_PERIOD = 7 * timePeriod; // TODO get from PolsStake.ts

  let userClaimableRewards_contract: bigint = 0n; // typeof BigNumber; // causes problems with solidity-coverage
  let userRewardTokenBalance_start: bigint = 0n;
  let stakeTokenDecimals: number;
  let rewardTokenDecimals: number;

  let stakeTime1: number;
  let stakeTime2: number;
  let expectedRewards: bigint = 0n;

  const filenameHeader = path.basename(__filename).concat(" ").padEnd(80, "=").concat("\n");

  describe("PolsStake : " + filenameHeader, function () {
    if (network.name != "hardhat") this.timeout(TIMEOUT_BLOCKCHAIN_ms); // setup timeout to 5 min

    it("stake token should have 18 decimals", async function () {
      stakeTokenDecimals = Number(await this.stakeToken.decimals());
      expect(stakeTokenDecimals).to.equal(DECIMALS);
    });

    it("reward token should have 18 decimals", async function () {
      rewardTokenDecimals = Number(await this.stakeToken.decimals());
      expect(rewardTokenDecimals).to.equal(DECIMALS);
    });

    it("get lockTime from stake contracts", async function () {
      const lockTimePeriod = await this.stakeV2.getLockTimePeriod();
      expect(lockTimePeriod).to.equal(LOCK_TIME_PERIOD);
    });

    it("send stake token from admin account to user1 account", async function () {
      const amount = "10000" + "0".repeat(18);

      const tx = await this.stakeToken.connect(this.signers.admin).transfer(this.signers.user1, amount);
      await tx.wait();

      const balance = await this.stakeToken.balanceOf(this.signers.user1);
      console.log("user1 : stakeToken balance = ", ethers.formatUnits(balance, stakeTokenDecimals));
      expect(balance).to.equal(amount);
    });

    it("user1 should have some stake tokens", async function () {
      const amount = "10000" + "0".repeat(18);
      // no transfer of stake token to user1 here
      const balance = await this.stakeToken.balanceOf(this.signers.user1);
      console.log("user1 : stakeToken balance = ", ethers.formatUnits(balance, stakeTokenDecimals));
      expect(balance).to.equal(amount);
    });

    it("deploy a reward token and mint some token to admin account", async function () {
      const balance = await this.rewardToken.balanceOf(this.signers.admin);
      console.log("reward token balance of admin =", ethers.formatUnits(balance, rewardTokenDecimals));
      expect(balance).to.gte(ethers.parseUnits("1000.0", rewardTokenDecimals));
    });

    it("user1 should have no rewards token", async function () {
      userRewardTokenBalance_start = await this.rewardToken.balanceOf(this.signers.user1);
      console.log("reward token balance of user1 = ", userRewardTokenBalance_start.toString());
      if (this.stakeToken != this.rewardToken) {
        expect(userRewardTokenBalance_start).to.equal(0);
      }
    });

    it("send 1000 reward tokens from admin account to staking contract", async function () {
      const amount = ethers.parseUnits("1000.0", rewardTokenDecimals);

      const tx = await this.rewardToken.connect(this.signers.admin).transfer(this.stakeV2, amount);
      await tx.wait();

      const balance = await this.rewardToken.balanceOf(this.stakeV2);
      console.log(
        "staking contract reward token balance = ",
        ethers.formatUnits(balance, rewardTokenDecimals),
      );
      expect(balance).to.equal(amount);
    });

    it("decrease lock time period - setLockTimePeriodDefault()", async function () {
      const lockTimePeriod = await this.stakeV2.getLockTimePeriod();
      console.log("current lockTimePeriod =", lockTimePeriod);

      const tx = await this.stakeV2.connect(this.signers.admin).setLockTimePeriodDefault(lockTimePeriod - 1n); // reduce by 1 second
      await tx.wait();

      const result = await this.stakeV2.getLockTimePeriod();
      console.log("lockTimePeriod (seconds) = ", result.toString());
      expect(result).to.equal(lockTimePeriod - 1n);
    });

    /**
     * @dev `await expect(this.stakeV2.connect(this.signers.admin).setLockTimePeriodDefault(14 * timePeriod)).to.be.reverted;`
     * @dev ... does not work with "real" (test) blockchain over RPC, so we need this work around
     */
    /*
    it("increase lock time period - setLockTimePeriodDefault() - should revert", async function () {
      // await expect(this.stakeV2.connect(this.signers.admin).setLockTimePeriodDefault(14 * timePeriod)).to.be.reverted; // does not work with remote RPC blockchain

      this.timeout(600000);
      let revert = false;

      try {
        const options = { gasLimit: 500000 };
        const tx = await this.stakeV2.connect(this.signers.admin).setLockTimePeriodDefault(14 * timePeriod, options);
        await tx.wait();
      } catch (error: any) {
        // console.log("catched ERROR");
        // console.log("error.code   =", error.code);
        // console.log("error.reason =", error.reason);
        // console.log("error =", error);

        if (network.name == "hardhat") {
          // network.chainId == 31337
          revert = error.toString().startsWith("Error: VM Exception while processing transaction: reverted");
        } else {
          revert = error.code == Logger.errors.CALL_EXCEPTION; // && error.reason == "transaction failed";
        }
      }

      expect(revert).to.be.true;
    });
    */

    it("setRewardToken()", async function () {
      const tx = await this.stakeV2.connect(this.signers.admin).setRewardToken(this.rewardToken);
      await tx.wait();

      const rewardToken_address = await this.stakeV2.rewardToken();
      console.log("this.stakeV2.rewardToken() = ", rewardToken_address);
      expect(rewardToken_address).to.equal(await this.rewardToken.getAddress());
    });

    it("setStakeRewardFactor()", async function () {
      const tx = await this.stakeV2.connect(this.signers.admin).setStakeRewardFactor(stakeRewardFactor);
      await tx.wait();

      const result = await this.stakeV2.stakeRewardFactor();
      console.log("stakeRewardFactor = ", result.toString());
      expect(result).to.equal(stakeRewardFactor);
    });
  });

  /**
   * @notice testing full staking cycle
   */

  describe("test stake & unstake, time lock and rewards", function () {
    if (network.name != "hardhat") this.timeout(TIMEOUT_BLOCKCHAIN_ms); // setup timeout to 5 min

    let timeNow: number; // number type makes time calculations easier
    let startTime: number; // time when the test starts
    let timeRelative: number; // will store time relative to start time
    let blocktime: number;
    let stakeBalance: bigint = 0n;
    let difference: bigint = 0n;
    let user1BalanceStart: bigint = 0n;

    /**
     * @dev helper function to get block.timestamp from hardhat provider
     * @returns block.timestamp in unix epoch time (seconds)
     */
    const blockTimestamp = async (): Promise<number> => {
      const blockNumber = await ethers.provider.getBlockNumber();
      const block = await ethers.provider.getBlock(blockNumber);
      if (block === null) {
        return 0
      } else {
        return block.timestamp;
      }
    };

    /**
     * @dev helper function for hardhat local blockchain to move time
     * @param timeAmount in seconds blockchain time should move forward
     */
    const moveTime = async (timeAmount: number): Promise<number> => {
      console.log("Jumping ", timeAmount, "seconds into the future ...");
      await ethers.provider.send("evm_increaseTime", [timeAmount]);
      await ethers.provider.send("evm_mine", []);
      const blockNumber = await ethers.provider.getBlockNumber();
      const timeNow = await blockTimestamp();
      console.log("moveTime : timeNow =", timeNow);
      console.log("----------------------------------------------------------------------------");
      return timeNow;
    };

    const getTimestamp = async (): Promise<number> => {
      let currentTime: number;
      if (network.name == "hardhat") {
        currentTime = await blockTimestamp();
      } else {
        currentTime = Math.floor(Date.now() / 1000);
      }
      return currentTime;
    };

    /**
     * @dev move time forward on hardhat
     * @dev just wait if on a "real" blockchain
     * @param timeAmount in seconds blockchain time should move forward
     */
    const waitTime = async (timeAmount: number): Promise<number> => {
      let newTime: number;
      if (network.name == "hardhat") {
        newTime = await moveTime(timeAmount);
      } else {
        await new Promise(f => setTimeout(f, timeAmount * 1000));
        newTime = Math.floor(Date.now() / 1000);
      }
      return newTime;
    };

    /**
     * @notice testing full staking & reward round-trip
     */

    it("user approves stake token", async function () {
      startTime = await getTimestamp();
      console.log("startTime =", startTime);

      user1BalanceStart = await this.stakeToken.balanceOf(this.signers.user1);
      console.log("user1Balance =", ethers.formatUnits(user1BalanceStart, stakeTokenDecimals));

      const tx = await this.stakeToken.connect(this.signers.user1).approve(this.stakeV2, user1BalanceStart);
      await tx.wait();

      const allowance = await this.stakeToken.allowance(this.signers.user1, this.stakeV2);
      console.log("user1 approved allowance   =", ethers.formatUnits(allowance, stakeTokenDecimals));

      // at this time the balance of the stake token in the contract should be 0
      stakeBalance = await this.stakeV2.stakeAmount(this.signers.user1);
      expect(allowance).to.equal(user1BalanceStart, "approval of stake token did not work");
    });

    it("staked amount should be 0 at this point", async function () {
      // at this time the balance of the stake token in the contract should be 0
      stakeBalance = await this.stakeV2.stakeAmount(this.signers.user1);
      expect(stakeBalance).to.equal(0, "user should have a stake balance of 0");
    });

    it("user can not stake if userStakeAmountMax=0", async function () {
      await expect(this.stakeV2.connect(this.signers.user1).stakelockTimeChoice(STAKE_AMOUNT, 1)).to.be.reverted;
    });

    it("user can not execute setUserStakeAmountMax()", async function () {
      await expect(this.stakeV2.connect(this.signers.user1).setUserStakeAmountMax(STAKE_AMOUNT_MAX)).to.be.reverted;
    });

    it("admin can execute setUserStakeAmountMax()", async function () {
      const tx = await this.stakeV2.connect(this.signers.admin).setUserStakeAmountMax(STAKE_AMOUNT_MAX);
      await tx.wait();

      const result = await this.stakeV2.userStakeAmountMax();
      expect(result).to.equal(STAKE_AMOUNT_MAX);
    });

    it("user can stake token", async function () {
      console.log("staking now ... STAKE_AMOUNT =", ethers.formatUnits(STAKE_AMOUNT, stakeTokenDecimals));

      const tx = await this.stakeV2.connect(this.signers.user1).stake(STAKE_AMOUNT);
      await tx.wait();

      blocktime = await getTimestamp();
      console.log("blocktime =", blocktime.toString());
      const stakeTime = Number(await this.stakeV2.connect(this.signers.user1).stakeTime_msgSender());
      console.log("stakeTime =", stakeTime.toString());
      expect(Math.abs(blocktime - stakeTime)).lte(60, "stakeTime not within 60 seconds of current blocktime");

      stakeTime1 = blocktime;

      stakeBalance = await this.stakeV2.stakeAmount(this.signers.user1);
      console.log("stakeBalance =", ethers.formatUnits(stakeBalance, stakeTokenDecimals));
      expect(stakeBalance).to.equal(STAKE_AMOUNT, "stake contract does not reflect staked amount");

      expect(await this.stakeToken.balanceOf(this.signers.user1)).to.equal(
        user1BalanceStart - STAKE_AMOUNT,
        "user1 balance was not reduced by staked amount",
      );
    });

    it("verify getUnlockTime_msgSender()", async function () {
      const unlockTime = Number(await this.stakeV2.connect(this.signers.user1).getUnlockTime_msgSender());
      const stakeTime = Number(await this.stakeV2.connect(this.signers.user1).stakeTime_msgSender());
      console.log("unlockTime =", unlockTime);
      console.log("stakeTime  =", stakeTime);
      console.log("LOCK_TIME_PERIOD =", LOCK_TIME_PERIOD);
      expect(Math.abs(unlockTime - stakeTime - LOCK_TIME_PERIOD)).lte(
        60,
        "stakeTime not within 60 seconds of current blocktime",
      );
    });

    it("user can not unstake during the lockTimePeriod", async function () {
      // wait 5 timePeriods
      if (network.name != "hardhat") this.timeout(5 * timePeriod * 1000 + TIMEOUT_BLOCKCHAIN_ms); // wait time + 15 min timeout for RPC call
      timeNow = await waitTime(5 * timePeriod);
      timeRelative = timeNow - startTime;

      /**
       * Test TIMELOCK
       * LockTimePeriod of 7 timePeriods has not expired yet - withdraw should fail
       * https://ethereum-waffle.readthedocs.io/en/latest/matchers.html?highlight=revert#revert
       */
      await expect(this.stakeV2.connect(this.signers.user1).withdrawAll()).to.be.reverted;
    });

    it("no accumulated rewards while staking for the first time", async function () {
      expect(await this.stakeV2.connect(this.signers.user1).userAccumulatedRewards_msgSender()).to.equal(
        0,
        "user should not have any accumulated rewards",
      );
    });

    it("user should have claimable rewards after staking for some time", async function () {
      const stakeTime = await this.stakeV2.connect(this.signers.user1).stakeTime_msgSender();
      console.log("stakeTime =", stakeTime.toString());

      const blockTime = await blockTimestamp();
      console.log("blockTime =", blockTime);

      const stakeRewardEndTime = await this.stakeV2.stakeRewardEndTime();
      console.log("stakeRewardEndTime =", stakeRewardEndTime.toString());

      const userClaimableRewards_expected = STAKE_AMOUNT * BigInt(blockTime - stakeTime1);
      console.log("userClaimableRewards_expected =", userClaimableRewards_expected.toString());

      userClaimableRewards_contract = await this.stakeV2.connect(this.signers.user1).userClaimableRewards_msgSender();
      console.log("userClaimableRewards_contract =", userClaimableRewards_contract.toString());

      difference = abs(userClaimableRewards_contract - userClaimableRewards_expected) / stakeBalance;
      console.log("difference =", difference.toString());
      expect(difference).to.lte(5, "userClaimableRewards calculation is too far off");
    });

    it("user can stake same amount again, should have staked 2x then", async function () {
      // stake same amount again - lock period starts again
      console.log("staking now ... STAKE_AMOUNT =", ethers.formatUnits(STAKE_AMOUNT, stakeTokenDecimals));

      const tx = await this.stakeV2.connect(this.signers.user1).stake(STAKE_AMOUNT);
      await tx.wait();

      stakeTime2 = await getTimestamp();

      stakeBalance = await this.stakeV2.stakeAmount(this.signers.user1);
      console.log("stakeBalance =", ethers.formatUnits(stakeBalance, stakeTokenDecimals));
      expect(stakeBalance).to.equal(STAKE_AMOUNT * 2n, "stake contract does not reflect staked amount");

      expect(await this.stakeToken.balanceOf(this.signers.user1)).to.equal(
        user1BalanceStart - (STAKE_AMOUNT) - (STAKE_AMOUNT),
        "user1 balance was not reduced by staked amount",
      );
    });

    it("after the 2nd staking, claimable rewards should have become accumulated reward", async function () {
      /**
       * Check userAccumulatedRewards
       * After the 2nd staking, claimable reward should have become accumulated reward
       * There may be a difference of one block time of rewards
       */

      const blockTime = await blockTimestamp();
      const userAccumulatedRewards_expected = STAKE_AMOUNT * BigInt(blockTime - stakeTime1);

      const userAccumulatedRewards_contract = await this.stakeV2
        .connect(this.signers.user1)
        .userAccumulatedRewards_msgSender();

      difference = abs(userAccumulatedRewards_contract - userAccumulatedRewards_expected) / STAKE_AMOUNT; // relative error to stakeBalance

      console.log(
        "(userAccumulatedRewards_contract - userClaimableRewards_contract) / stakeBalance =",
        difference.toString(),
      );
      expect(difference).to.lte(60, "userAccumulatedRewards is too far off");
    });

    it("after staking again, userClaimableRewards should be close to zero", async function () {
      /**
       * Check userClaimableRewards
       * After the 2nd staking, claimable reward should have been reset to 0
       * At most 20 sec should have been passed since then, accumulating a small userClaimableRewards balance
       */
      userClaimableRewards_contract = await this.stakeV2.connect(this.signers.user1).userClaimableRewards_msgSender();

      expect(userClaimableRewards_contract).to.lte(
        stakeBalance * 20n,
        "claimable reward should have been reset to 0",
      );
    });

    it("check userClaimableRewards", async function () {
      // wait 10 time periods
      if (network.name != "hardhat") this.timeout(10 * timePeriod * 1000 + TIMEOUT_BLOCKCHAIN_ms);
      timeNow = await waitTime(10 * timePeriod);
      timeRelative = timeNow - startTime;

      /**
       * check claimable rewards. should be ~ 2 * STAKE_AMOUNT * 10 timePeriods
       */
      const blockTime = await blockTimestamp();
      const userClaimableRewards_expected = STAKE_AMOUNT * 2n * BigInt(blockTime - stakeTime2);
      console.log("userClaimableRewards_expected =", userClaimableRewards_expected.toString());

      userClaimableRewards_contract = await this.stakeV2.connect(this.signers.user1).userClaimableRewards_msgSender();
      console.log("userClaimableRewards_contract =", userClaimableRewards_contract.toString());

      difference = abs(userClaimableRewards_contract - userClaimableRewards_expected) / stakeBalance;
      console.log("difference =", difference.toString());
      expect(difference).to.lte(20, "userClaimableRewards calculation is too far off");
    });

    it("user can unstake after the lockTimePeriod is over", async function () {
      const lastStakeBalance = stakeBalance;

      // withdraw one quarter of staked tokens
      const tx = await this.stakeV2.connect(this.signers.user1).withdraw(lastStakeBalance / 4n);
      await tx.wait();

      stakeBalance = await this.stakeV2.stakeAmount(this.signers.user1);

      const remainStakeBalance = lastStakeBalance - (lastStakeBalance / 4n);

      expect(stakeBalance).to.equal(remainStakeBalance, "remaining staked amount wrong");

      expect(await this.stakeToken.balanceOf(this.signers.user1)).to.equal(
        user1BalanceStart - (remainStakeBalance),
        "unstaked amount was not correctly added to user's balance",
      );

      console.log("**************************** UNSTAKE ****************************");

      // UNSTAKE - withdraw all remaining staked tokens
      const tx2 = await this.stakeV2.connect(this.signers.user1).withdrawAll();
      await tx2.wait();

      blocktime = await getTimestamp();

      // 1st staking period = (stakeTime2 - stakeTime1) @ 1 * STAKE_AMOUNT
      // 2nd staking period = (blocktime  - stakeTime2) @ 2 * STAKE_AMOUNT
      expectedRewards = STAKE_AMOUNT * BigInt(stakeTime2 - stakeTime1) + (STAKE_AMOUNT * 2n * BigInt(blocktime - stakeTime2));
      console.log(">>>>>> expectedRewards =", expectedRewards.toString());

      // stake amount should be zero
      stakeBalance = await this.stakeV2.stakeAmount(this.signers.user1);
      expect(stakeBalance).to.equal(0, "stake amount should be 0");

      // user1 balance should be back to original amount
      expect(await this.stakeToken.balanceOf(this.signers.user1)).to.equal(
        user1BalanceStart,
        "user1 balance should be back to original amount",
      );

      // log timestamp
      timeNow = await getTimestamp();
      timeRelative = timeNow - startTime;
      console.log("timeNow      =", timeNow);
      console.log("timeRelative =", timeRelative);
      console.log("simulated time : seconds / timePeriods", timeRelative, timeRelative / timePeriod);
      console.log("----------------------------------------------------------------------------");

      const userClaimableRewards = await this.stakeV2.connect(this.signers.user1).userClaimableRewards_msgSender();
      console.log(">>>>>> userClaimableRewards   =", userClaimableRewards.toString());

      const userAccumulatedRewards = await this.stakeV2.connect(this.signers.user1).userAccumulatedRewards_msgSender();
      console.log(">>>>>> userAccumulatedRewards =", userAccumulatedRewards.toString());

      const userTotalRewards = await this.stakeV2.connect(this.signers.user1).userTotalRewards_msgSender();
      console.log(">>>>>> userTotalRewards       =", userTotalRewards.toString());

      const earnedRewardTokens = await this.stakeV2.connect(this.signers.user1).getEarnedRewardTokens_msgSender();
      console.log(">>>>>> earnedRewardTokens     =", earnedRewardTokens.toString());

      // >>>>>>>>>>>>>>>>  WAIT 5 time periods - user should not receive any additional rewards <<<<<<<<<<<<<<<<<<<<<<
      const waitingTime = 5 * timePeriod;
      if (network.name != "hardhat") this.timeout(waitingTime * 1000 + TIMEOUT_BLOCKCHAIN_ms); // wait time + 5 min timeout for RPC call
      console.log("waiting (seconds) ...", waitingTime);
      timeNow = await waitTime(waitingTime);

      // log timestamp
      timeNow = await getTimestamp();
      timeRelative = timeNow - startTime;
      console.log("timeNow      =", timeNow);
      console.log("timeRelative =", timeRelative);
      console.log("simulated time : seconds / timePeriods", timeRelative, timeRelative / timePeriod);
      console.log("----------------------------------------------------------------------------");

      const userClaimableRewards_later = await this.stakeV2.connect(this.signers.user1).userClaimableRewards_msgSender();
      console.log(">>>>>> userClaimableRewards_later   =", userClaimableRewards_later.toString());

      const userAccumulatedRewards_later = await this.stakeV2
        .connect(this.signers.user1)
        .userAccumulatedRewards_msgSender();
      console.log(">>>>>> userAccumulatedRewards_later =", userAccumulatedRewards_later.toString());

      const userTotalRewards_later = await this.stakeV2.connect(this.signers.user1).userTotalRewards_msgSender();
      console.log(">>>>>> userTotalRewards_later       =", userTotalRewards_later.toString());

      const earnedRewardTokens_later = await this.stakeV2.connect(this.signers.user1).getEarnedRewardTokens_msgSender();
      console.log(">>>>>> earnedRewardTokens_later     =", earnedRewardTokens_later.toString());

      expect(userClaimableRewards_later).to.equal(userClaimableRewards, "userClaimableRewards changed after unstaking");
      expect(userAccumulatedRewards_later).to.equal(
        userAccumulatedRewards,
        "userAccumulatedRewards changed after unstaking",
      );
      expect(userTotalRewards_later).to.equal(userTotalRewards, "userTotalRewards changed after unstaking");
      expect(earnedRewardTokens_later).to.equal(earnedRewardTokens, "earnedRewardTokens changed after unstaking");

      /**
       * Check userClaimableRewards
       * After unstaking, claimable rewards should have been reset to 0 ...
       * and no rewards should have been earned in the timePeriods thereafter
       */
      expect(await this.stakeV2.connect(this.signers.user1).userClaimableRewards_msgSender()).to.equal(
        0,
        "claimable rewards should stay at 0 and not increase after full unstake",
      );

      /**
       * Check userAccumulatedRewards
       */
      // const rewardsStake1 = STAKE_AMOUNT * (15) * (timePeriod); // TODO - use measured, expired time
      // const rewardsStake2 = STAKE_AMOUNT * (10) * (timePeriod);
      // const userAccumulatedRewards_expected = rewardsStake1 + (rewardsStake2);

      const userAccumulatedRewards_expected = expectedRewards; // STAKE_AMOUNT * (stakeTime2 - stakeTime1) + ( STAKE_AMOUNT * (2) * (blocktime - stakeTime2) );

      const userAccumulatedRewards_contract = await this.stakeV2
        .connect(this.signers.user1)
        .userAccumulatedRewards_msgSender();

      difference = abs(userAccumulatedRewards_contract - userAccumulatedRewards_expected) / lastStakeBalance;
      console.log("userAccumulatedRewards_expected =", userAccumulatedRewards_expected.toString());
      console.log("userAccumulatedRewards_contract =", userAccumulatedRewards_contract.toString());
      console.log("userAccumulatedRewards : difference contract vers expected =", difference.toString());
      expect(difference).to.lte(60, "userAccumulatedRewards is too far off");

      /**
       * Check userTotalRewards, should equal accumulatedRewards at this stage
       */
      const userTotalRewards_contract = await this.stakeV2.connect(this.signers.user1).userTotalRewards_msgSender();
      difference = abs(userAccumulatedRewards_contract - userTotalRewards_contract) / lastStakeBalance;
      console.log("userTotalRewards       : difference contract vers expected =", difference.toString());
      expect(difference).to.lte(1, "userTotalRewards is too far off");
    });

    it("after withdrawAll, user should not be able to withdraw any additional tokens", async function () {
      await expect(this.stakeV2.connect(this.signers.user1).withdraw(1)).to.be.reverted;
    });

    /**
     * test for reward token allocation manipulation - after withdrawAll()
     */
    it("after withdrawAll, user should not be able to increase rewards by calling withdraw(0)", async function () {
      const totalRewards_before = await this.stakeV2.connect(this.signers.user1).userTotalRewards_msgSender();
      console.log("totalRewards_before =", ethers.formatUnits(totalRewards_before, rewardTokenDecimals));

      await expect(this.stakeV2.connect(this.signers.user1).withdraw(0)).to.be.reverted;
      // await tx2.wait();

      const totalRewards_after = await this.stakeV2.connect(this.signers.user1).userTotalRewards_msgSender();
      console.log("totalRewards_after  =", ethers.formatUnits(totalRewards_after, rewardTokenDecimals));

      expect(totalRewards_after).to.equal(totalRewards_before);
    });

    /**
     * user should get 1 rewardToken for staking 1000 stakeToken for 5 timePeriods
     * In this test scenario we expect the user to receive 5 rewardToken (* 18 decimals)
     * (1000 token * 5 timePeriods) + (2000 token * 10 timePeriods) => 25 reward token
     */
    it("let user claim/mint rewardToken corresponding to their reward balance ", async function () {
      // const userRewardTokenReceived_expected = BigNumber.from(10).pow(rewardTokenDecimals) * (25);
      const userRewardTokenReceived_expected = expectedRewards / BigInt(stakeRewardFactor);

      const userRewardTokenBalance_before = await this.rewardToken.balanceOf(this.signers.user1);
      console.log(
        "user reward token balance  - before  = ",
        ethers.formatUnits(userRewardTokenBalance_before, rewardTokenDecimals),
      );

      const tx = await this.stakeV2.connect(this.signers.user1).claim();
      await tx.wait();

      const userRewardTokenBalance_after = await this.rewardToken.balanceOf(this.signers.user1);
      console.log(
        "user reward token balance  - after    =",
        ethers.formatUnits(userRewardTokenBalance_after, rewardTokenDecimals),
      );

      console.log(
        "user reward token received - expected =",
        ethers.formatUnits(userRewardTokenReceived_expected, rewardTokenDecimals),
      );

      const userRewardTokenBalance_received = userRewardTokenBalance_after - (userRewardTokenBalance_before);
      console.log(
        "user reward token received - actual   =",
        ethers.formatUnits(userRewardTokenBalance_received, rewardTokenDecimals),
      );

      const difference = abs(userRewardTokenBalance_received - userRewardTokenReceived_expected);
      console.log(
        "user reward token received - diff     = ",
        ethers.formatUnits(difference, rewardTokenDecimals),
      );

      expect(difference).lte(ethers.parseUnits("0.1", rewardTokenDecimals));
    });

    /**
     * admin can set disable reward token by calling setRewardToken(0)
     * admin will receive all reward tokens left in the staking contract
     */
    it("admin can disable reward token and will receive all reward tokens left", async function () {
      const stakeRewardTokenBalance_before = await this.stakeV2.getRewardTokenBalance();
      const adminRewardTokenBalance_before = await this.rewardToken.balanceOf(this.signers.admin);

      const tx = await this.stakeV2.connect(this.signers.admin).setRewardToken(ethers.ZeroAddress);
      await tx.wait();

      const stakeRewardTokenBalance_after = await this.stakeV2.getRewardTokenBalance();
      const adminRewardTokenBalance_after = await this.rewardToken.balanceOf(this.signers.admin);

      expect(stakeRewardTokenBalance_after).to.equal(0);
      expect(adminRewardTokenBalance_after).to.equal(
        adminRewardTokenBalance_before + (stakeRewardTokenBalance_before),
      );
    });
  });
}
