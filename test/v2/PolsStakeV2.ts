
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers, network } from "hardhat";

import type { Signers } from "../types";
import { deployStakeV2Fixture } from "./StakeV2.fixture";
import { deployStakeV1Fixture } from "../v1/StakeV1.fixture";

import { expect } from "chai";
import * as path from "path";

import { BigNumber, BigNumberish } from "ethers";

import { timePeriod, getTimestamp, moveTime, waitTime, setTime, consoleLog_timestamp } from "../libs/BlockTimeHelper";

import { basicTestsV2 } from "./PolsStakeV2.basicTests";

const PERIOD_HARDHAT = 24 * 60 * 60; // 1 day (simulated time periods) on hardhat
const PERIOD_BLOCKCHAIN = 60; // 1 minute on "real" blockchains

const lockPeriod = 7 * timePeriod();

const REWARDS_DIV = 1_000_000;

const TIMEOUT_BLOCKCHAIN_ms = 10 * 60 * 1000; // 10 minutes

const filenameHeader = path.basename(__filename).concat(" ").padEnd(80, "=").concat("\n");

describe("PolsStake : " + filenameHeader, function () {
  console.log("network name =", network.name);
  if (network.name != "hardhat") this.timeout(TIMEOUT_BLOCKCHAIN_ms);

  before(async function () {
    this.signers = {} as Signers;
    const signers: SignerWithAddress[] = await ethers.getSigners();
    const admin: SignerWithAddress = signers[0];
    // const user1: SignerWithAddress = signers[1];
    // const user2: SignerWithAddress = signers[2];
    this.signers.admin = signers[0];
    this.signers.user1 = signers[1];
    this.signers.user2 = signers[2];

    const gasPriceString = await ethers.provider.getGasPrice();
    console.log("Current gas price: " + gasPriceString);

    console.log("deployer account           :", this.signers.admin.address);

    const deployerBalance = await ethers.provider.getBalance(this.signers.admin.address);
    console.log("deployer account balance   :", ethers.utils.formatUnits(deployerBalance));
    if (deployerBalance.lt(ethers.utils.parseUnits("1.0"))) {
      console.error("ERROR: Balance too low");
      process.exit(1);
    }

    console.log("user1    account           :", this.signers.user1.address);

    const user1Balance = await ethers.provider.getBalance(this.signers.user1.address);
    console.log("user1    account balance   :", ethers.utils.formatUnits(user1Balance));
    if (user1Balance.lt(ethers.utils.parseUnits("1.0"))) {
      console.error("ERROR: Balance too low");
      process.exit(1);
    }

    this.loadFixture = loadFixture;

    const { stakeToken, rewardToken, stakeV2 } = await this.loadFixture(deployStakeV2Fixture);

    this.stakeToken = stakeToken;
    this.rewardToken = rewardToken;
    this.stakeV2 = stakeV2;

    console.log("stakeToken        deployed to :", this.stakeToken.address);
    console.log("rewardToken       deployed to :", this.rewardToken.address);
    console.log("stake contract V2 deployed to :", this.stakeV2.address);
  });
  // set to v2 mode
  // lockedRewardsEnabled  = true
  // unlockedRewardsFactor = 0.5

  // basicTestsV2(timePeriod(), true, REWARDS_DIV / 2); // TODO - run test suite !!!

  // accidentally send a token directly to the contract ... admin can recover them
  // we (re)use the reward token, but it could be any token, except the stake token
  describe("test removeOtherERC20Tokens()", function () {
    if (network.name != "hardhat") this.timeout(TIMEOUT_BLOCKCHAIN_ms);

    it("a token is accidentally being send directly to staking contract => recover", async function () {
      const amount = "10" + "0".repeat(18);
      const balance = await this.rewardToken.balanceOf(this.signers.admin.address);

      const tx1 = await this.rewardToken.connect(this.signers.admin).transfer(this.stakeV2.address, amount);
      await tx1.wait();

      expect(await this.rewardToken.balanceOf(this.signers.admin.address)).to.equal(balance.sub(amount));

      const tx2 = await this.stakeV2.connect(this.signers.admin).removeOtherERC20Tokens(this.rewardToken.address);
      await tx2.wait();

      expect(await this.rewardToken.balanceOf(this.signers.admin.address)).to.equal(balance);
    });
  });

  describe("PolsStake > PolsStakeV2 token & rewards migration", function () {
    let timeNow: number; // number type makes time calculations easier
    let startTime: number; // time when the test starts
    let timeRelative: number; // will store time relative to start time
    let blocktime: number;
    let stakeTokenDecimals: number;
    let stakeBalance = BigNumber.from(0);
    let difference = BigNumber.from(0);
    let user1BalanceStart = BigNumber.from(0);

    const stakeAmount: number = 1000;

    it("deploy PolsStake v1", async function () {
      const { stakeToken, rewardToken, stakeV1 } = await this.loadFixture(deployStakeV1Fixture);
      this.stake = stakeV1;
      console.log("stakeV1 contract is at       :", this.stakeV2.address);
      console.log("stakeV2 contract deployed to :", this.stake.address);
    });

    it("user approves stake token for PolsStake v1", async function () {
      startTime = await getTimestamp();
      console.log("startTime =", startTime);

      stakeTokenDecimals = await this.stakeToken.decimals();

      user1BalanceStart = await this.stakeToken.balanceOf(this.signers.user1.address);
      console.log("user1Balance =", ethers.utils.formatUnits(user1BalanceStart, stakeTokenDecimals));

      const tx = await this.stakeToken.connect(this.signers.user1).approve(this.stake.address, user1BalanceStart);
      await tx.wait();

      const allowance = await this.stakeToken.allowance(this.signers.user1.address, this.stake.address);
      console.log("user1 approved allowance   =", ethers.utils.formatUnits(allowance, stakeTokenDecimals));

      // at this time the balance of the stake token in the contract should be 0
      stakeBalance = await this.stake.stakeAmount(this.signers.user1.address);
      expect(allowance).to.equal(user1BalanceStart, "approval of stake token did not work");
    });

    it("staked amount in PolsStake v1 should be 0", async function () {
      // at this time the balance of the stake token in the contract should be 0
      stakeBalance = await this.stake.stakeAmount(this.signers.user1.address);
      expect(stakeBalance).to.equal(0, "user should have a stake balance of 0");
    });

    it("user can stake token in PolsStake v1", async function () {
      console.log("staking now ... stakeAmount =", ethers.utils.formatUnits(stakeAmount, stakeTokenDecimals));

      const tx = await this.stake.connect(this.signers.user1).stake(stakeAmount);
      await tx.wait();

      blocktime = await getTimestamp();
      console.log("blocktime =", blocktime.toString());
      const stakeTime = await this.stake.connect(this.signers.user1).stakeTime_msgSender();
      console.log("stakeTime =", stakeTime.toString());
      expect(Math.abs(blocktime - stakeTime)).lte(60, "stakeTime not within 60 seconds of current blocktime");

      let stakeTime1 = blocktime;

      stakeBalance = await this.stake.stakeAmount(this.signers.user1.address);
      console.log("stakeBalance =", ethers.utils.formatUnits(stakeBalance, stakeTokenDecimals));
      expect(stakeBalance).to.equal(stakeAmount, "stake contract does not reflect staked amount");

      expect(await this.stakeToken.balanceOf(this.signers.user1.address)).to.equal(
        user1BalanceStart.sub(stakeAmount),
        "user1 balance was not reduced by staked amount",
      );

      // wait until tokens are unlocked
      waitTime(lockPeriod + timePeriod());
    });

    /*
     * allow stakeV2 contract to burn staker's rewards in stake v1
     * stake v1 : the name of the role is BURNER_ROLE
     * stakeV2  : the name of the role is REWARDS_BURNER_ROLE
     */
    it("grant stakeV2 contract the BURNER_ROLE for stake v1 contract", async function () {
      const BURNER_ROLE = await this.stake.BURNER_ROLE();

      const tx1 = await this.stake.connect(this.signers.admin).grantRole(BURNER_ROLE, this.stakeV2.address);
      await tx1.wait();

      expect(await this.stake.hasRole(BURNER_ROLE, this.stakeV2.address)).to.be.true;
    });

    it("set stake1 contract address within stake2", async function () {
      const tx1 = await this.stakeV2.connect(this.signers.admin).setPrevPolsStaking(this.stake.address);
      await tx1.wait();

      expect(await this.stakeV2.prevPolsStaking()).to.eq(this.stake.address);
    });

    it("user stakes some token in PolsStakeV2", async function () {
      const userWalletBalance = await this.stakeToken.balanceOf(this.signers.user1.address);
      const stakeAmountAdd = 2000;
      const stakeAmount = await this.stakeV2.connect(this.signers.user1).stakeAmount_msgSender();
      console.log("current staking balance in v2 :", stakeAmount);
      console.log("now staking additional amount :", stakeAmountAdd);

      const tx4 = await this.stakeV2.connect(this.signers.user1).stakelockTimeChoice(stakeAmountAdd, 1);
      await tx4.wait();

      expect(await this.stakeToken.balanceOf(this.signers.user1.address)).to.eq(userWalletBalance.sub(stakeAmountAdd));

      const stakeAmountFinal = await this.stakeV2.connect(this.signers.user1).stakeAmount_msgSender();
      console.log("final staking balance in v2   :", stakeAmountFinal);

      expect(stakeAmountFinal).to.eq(stakeAmount.add(stakeAmountAdd));
    });

    it("user1 migrates tokens & accumulated rewards from PolsStake v1 to PolsStakeV2 ", async function () {
      // get user's tokens in his wallet and the previous staking contract
      const userWalletBalance = await this.stakeToken.balanceOf(this.signers.user1.address);
      const stakeAmountPrev = await this.stake.connect(this.signers.user1).stakeAmount_msgSender();

      console.log("userWalletBalance    =", userWalletBalance);
      console.log("stakeAmountPrev      =", stakeAmountPrev);

      // unstake all tokens in previous contract
      console.log("unstaking all tokens from previous contract - withdrawAll()");
      const tx1 = await this.stake.connect(this.signers.user1).withdrawAll();
      await tx1.wait();

      expect(await this.stake.connect(this.signers.user1).stakeAmount_msgSender()).to.eq(0);
      expect(await this.stakeToken.balanceOf(this.signers.user1.address)).to.eq(userWalletBalance.add(stakeAmountPrev));

      // get current rewards of contracts
      const claimableRewardsV1 = await this.stake.connect(this.signers.user1).userClaimableRewards_msgSender();
      const accumulatedRewardsV1 = await this.stake.connect(this.signers.user1).userAccumulatedRewards_msgSender();
      const accumulatedRewardsV2 = await this.stakeV2.connect(this.signers.user1).userAccumulatedRewards_msgSender();

      console.log("claimableRewardsV1   =", claimableRewardsV1);
      console.log("accumulatedRewardsV1 =", accumulatedRewardsV1);
      console.log("accumulatedRewardsV2 =", accumulatedRewardsV2);

      expect(claimableRewardsV1).to.eq(0);

      // migrate (accumulated) rewards from v1 to v2
      const tx2 = await this.stakeV2.connect(this.signers.user1).migrateRewards();
      await tx2.wait();

      expect(await this.stake.userAccumulatedRewards(this.signers.user1.address)).to.eq(0);
      expect(await this.stakeV2.userAccumulatedRewards(this.signers.user1.address)).to.eq(
        accumulatedRewardsV1.add(accumulatedRewardsV2),
      );

      // calling migrateRewards a 2nd time should not work and should not add any rewards in stakeV2
      const tx3 = await this.stakeV2.connect(this.signers.user1).migrateRewards();
      await tx3.wait();

      expect(await this.stake.userAccumulatedRewards(this.signers.user1.address)).to.eq(0);
      expect(await this.stakeV2.userAccumulatedRewards(this.signers.user1.address)).to.eq(
        accumulatedRewardsV1.add(accumulatedRewardsV2),
      );

      // stake tokens from stake v1 into stakeV2
      const stakeAmount = await this.stakeV2.connect(this.signers.user1).stakeAmount_msgSender();
      console.log("current staking balance in v2 :", stakeAmount);
      console.log("now staking additional amount :", stakeAmountPrev);

      const tx4 = await this.stakeV2.connect(this.signers.user1).stakelockTimeChoice(stakeAmountPrev, 1);
      await tx4.wait();

      const stakeAmountFinal = await this.stakeV2.connect(this.signers.user1).stakeAmount_msgSender();
      console.log("final staking balance in v2   :", stakeAmountFinal);

      expect(stakeAmountFinal).to.eq(stakeAmount.add(stakeAmountPrev));
    });
  });
});
