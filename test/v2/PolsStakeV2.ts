
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, network } from "hardhat";

import type { Signers } from "../types";
import { deployStakeV2Fixture } from "./StakeV2.fixture";
// import { deployStakeV1Fixture } from "../v1/StakeV1.fixture";

import type { PolsStake } from "../../types/contracts/test/PolsStake";
import type { PolsStake__factory } from "../../types/factories/contracts/test/PolsStake__factory";

import { expect } from "chai";
import * as path from "path";

// import { BigNumber, BigNumberish } from "ethers";

import { timePeriod, getTimestamp, moveTime, waitTime, setTime, consoleLog_timestamp } from "../libs/BlockTimeHelper";

import { basicTestsV2 } from "./PolsStakeV2.basicTests";

const PERIOD_HARDHAT = 24 * 60 * 60; // 1 day (simulated time periods) on hardhat
const PERIOD_BLOCKCHAIN = 60; // 1 minute on "real" blockchains

const lockPeriod = 7 * timePeriod();

const REWARDS_DIV = 1_000_000;

const TIMEOUT_BLOCKCHAIN_ms = 10 * 60 * 1000; // 10 minutes

const filenameHeader = path.basename(__filename).concat(" ").padEnd(80, "=").concat("\n");

let stakeTokenDecimals: bigint; // will be retrieved from stake token contract after deployment
let stakeAmountDefault: bigint = 250n; // will be multiplied with 10**decimals after deployment of stake token

describe("PolsStake : " + filenameHeader, function () {
  console.log("network name =", network.name);
  if (network.name != "hardhat") this.timeout(TIMEOUT_BLOCKCHAIN_ms);

  before(async function () {
    this.signers = {} as Signers;
    const signers = await ethers.getSigners();
    this.signers.admin = signers[0];
    this.signers.user1 = signers[1];
    this.signers.user2 = signers[2];

    console.log("deployer account           :", await this.signers.admin.getAddress());

    const deployerBalance = await ethers.provider.getBalance(this.signers.admin);
    console.log("deployer account balance   :", ethers.formatUnits(deployerBalance));
    if (deployerBalance < ethers.parseUnits("1.0")) {
      console.error("ERROR: Balance too low");
      process.exit(1);
    }

    console.log("user1    account           :", await this.signers.user1.getAddress());

    const user1Balance = await ethers.provider.getBalance(this.signers.user1);
    console.log("user1    account balance   :", ethers.formatUnits(user1Balance));
    if (user1Balance < ethers.parseUnits("1.0")) {
      console.error("ERROR: Balance too low");
      process.exit(1);
    }

    this.loadFixture = loadFixture;

    const { stakeToken, rewardToken, stakeV2 } = await this.loadFixture(deployStakeV2Fixture);

    this.stakeToken = stakeToken;
    this.rewardToken = rewardToken;
    this.stakeV2 = stakeV2;

    stakeTokenDecimals = await this.stakeToken.decimals();
    stakeAmountDefault *= 10n ** stakeTokenDecimals;

    console.log("stakeToken        deployed to :", await this.stakeToken.getAddress());
    console.log("rewardToken       deployed to :", await this.rewardToken.getAddress());
    console.log("stake contract v2 deployed to :", await this.stakeV2.getAddress());

    console.log("stakeTokenDecimals            :", stakeTokenDecimals);
    console.log("stakeAmountDefault            :", stakeAmountDefault, " = ", ethers.formatUnits(stakeAmountDefault, stakeTokenDecimals));
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
      const amount = stakeAmountDefault;
      const balance = await this.rewardToken.balanceOf(this.signers.admin);

      const tx1 = await this.rewardToken.connect(this.signers.admin).transfer(this.stakeV2, amount);
      await tx1.wait();

      expect(await this.rewardToken.balanceOf(this.signers.admin)).to.equal(balance - amount);

      const tx2 = await this.stakeV2.connect(this.signers.admin).removeOtherERC20Tokens(this.rewardToken);
      await tx2.wait();

      expect(await this.rewardToken.balanceOf(this.signers.admin)).to.equal(balance);
    });
  });

  describe("PolsStake > PolsStakeV2 token & rewards migration", function () {
    let timeNow: number; // number type makes time calculations easier
    let startTime: number; // time when the test starts
    let timeRelative: number; // will store time relative to start time
    let blocktime: number;

    let stakeBalance = 0n;
    let difference = 0n;
    let user1BalanceStart = 0n;

    const stakeAmount = stakeAmountDefault;

    it("deploy PolsStake v1", async function () {
      const stakeV1Factory: PolsStake__factory = <PolsStake__factory>await ethers.getContractFactory("PolsStake");
      const stakeV1: PolsStake = <PolsStake>await stakeV1Factory.connect(this.signers.admin).deploy(this.stakeToken, 0);
      await stakeV1.waitForDeployment();
      this.stake = stakeV1;
      console.log("stakeV1 contract deployed to :", await this.stake.getAddress());
      expect(await this.stake.stakingToken()).to.eq(await this.stakeToken.getAddress(),
        "deployed stake v1 contract does not accept this stake token");
    });

    it("admin sends some stake token to user1", async function () {
      const tx1 = await this.stakeToken.connect(this.signers.admin).transfer(this.signers.user1, 4n * stakeAmountDefault);
      await tx1.wait();
      expect(await this.stakeToken.balanceOf(this.signers.user1)).to.eq(4n * stakeAmountDefault);
    });

    it("user approves stake token for PolsStake v1", async function () {
      startTime = await getTimestamp();
      console.log("startTime =", startTime);

      user1BalanceStart = await this.stakeToken.balanceOf(this.signers.user1);
      console.log("user1Balance =", ethers.formatUnits(user1BalanceStart, stakeTokenDecimals));

      const tx = await this.stakeToken.connect(this.signers.user1).approve(this.stake, user1BalanceStart);
      await tx.wait();

      const allowance = await this.stakeToken.allowance(this.signers.user1, this.stake);
      console.log("user1 approved allowance   =", ethers.formatUnits(allowance, stakeTokenDecimals));
      expect(allowance).to.equal(user1BalanceStart, "approval of stake token did not work");
    });

    it("staked amount in PolsStake v1 should be 0", async function () {
      // at this time the balance of the stake token in the contract should be 0
      stakeBalance = await this.stake.stakeAmount(this.signers.user1);
      expect(stakeBalance).to.equal(0, "user should have a stake balance of 0");
    });

    it("user can stake token in PolsStake v1", async function () {

      const balanceETH = await ethers.provider.getBalance(this.signers.user1);
      console.log("user1 balanceETH =", ethers.formatEther(balanceETH));

      console.log("staking now ... stakeAmount =", ethers.formatUnits(stakeAmountDefault, stakeTokenDecimals));

      const allowance = await this.stakeToken.allowance(this.signers.user1, this.stake);
      console.log("user1 approved allowance   =", ethers.formatUnits(allowance, stakeTokenDecimals));

      const tx = await this.stake.connect(this.signers.user1).stake(stakeAmountDefault);
      await tx.wait();

      blocktime = await getTimestamp();
      console.log("blocktime =", blocktime.toString());
      const stakeTime = Number(await this.stake.connect(this.signers.user1).stakeTime_msgSender());
      console.log("stakeTime =", stakeTime.toString());
      expect(Math.abs(blocktime - stakeTime)).lte(60, "stakeTime not within 60 seconds of current blocktime");

      const stakeBalance = await this.stake.stakeAmount(this.signers.user1);
      console.log("stakeBalance =", ethers.formatUnits(stakeBalance, stakeTokenDecimals));
      expect(stakeBalance).to.equal(stakeAmountDefault, "stake contract does not reflect staked amount");

      expect(await this.stakeToken.balanceOf(this.signers.user1)).to.equal(user1BalanceStart - stakeAmountDefault,
        "user1 balance was not reduced by staked amount");

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

      const tx1 = await this.stake.connect(this.signers.admin).grantRole(BURNER_ROLE, this.stakeV2);
      await tx1.wait();

      expect(await this.stake.hasRole(BURNER_ROLE, this.stakeV2)).to.be.true;
    });

    it("set stake1 contract address within stake2", async function () {
      const stakeV1address = await this.stake.getAddress();
      const tx1 = await this.stakeV2.connect(this.signers.admin).setPrevPolsStaking(stakeV1address);
      await tx1.wait();

      expect(await this.stakeV2.prevPolsStaking()).to.eq(stakeV1address);
    });

    it("user approves stake token for PolsStake v2", async function () {
      const tx = await this.stakeToken.connect(this.signers.user1).approve(this.stakeV2, 2n * stakeAmountDefault);
      await tx.wait();

      const allowance = await this.stakeToken.allowance(this.signers.user1, this.stakeV2);
      console.log("user1 approved allowance   =", ethers.formatUnits(allowance, stakeTokenDecimals));
      expect(allowance).to.equal(2n * stakeAmountDefault, "approval of stake token did not work");
    });

    it("user stakes some token in PolsStakeV2", async function () {
      const userWalletBalance = await this.stakeToken.balanceOf(this.signers.user1);
      const stakeAmountAdd = stakeAmountDefault;
      const stakeBalance = await this.stakeV2.connect(this.signers.user1).stakeAmount_msgSender();
      console.log("current staking balance in v2 :", stakeBalance);
      console.log("now staking additional amount :", stakeAmountAdd);

      const tx4 = await this.stakeV2.connect(this.signers.user1).stakelockTimeChoice(stakeAmountAdd, 1);
      await tx4.wait();

      expect(await this.stakeToken.balanceOf(this.signers.user1)).to.eq(userWalletBalance - stakeAmountAdd);

      const stakeAmountFinal = await this.stakeV2.connect(this.signers.user1).stakeAmount_msgSender();
      console.log("final staking balance in v2   :", stakeAmountFinal);

      expect(stakeAmountFinal).to.eq(stakeBalance + stakeAmountAdd);
    });

    it("user1 migrates tokens & accumulated rewards from PolsStake v1 to PolsStakeV2 ", async function () {
      // get user's tokens in his wallet and the previous staking contract
      const userWalletBalance = await this.stakeToken.balanceOf(this.signers.user1);
      const stakeAmountPrev = await this.stake.connect(this.signers.user1).stakeAmount_msgSender();

      console.log("userWalletBalance    =", userWalletBalance);
      console.log("stakeAmountPrev      =", stakeAmountPrev);

      // unstake all tokens in previous contract
      console.log("unstaking all tokens from previous contract - withdrawAll()");
      const tx1 = await this.stake.connect(this.signers.user1).withdrawAll();
      await tx1.wait();

      expect(await this.stake.connect(this.signers.user1).stakeAmount_msgSender()).to.eq(0);
      expect(await this.stakeToken.balanceOf(this.signers.user1)).to.eq(userWalletBalance + stakeAmountPrev);

      // get current rewards of contracts
      let claimableRewardsV1 = await this.stake.connect(this.signers.user1).userClaimableRewards_msgSender();
      let accumulatedRewardsV1 = await this.stake.connect(this.signers.user1).userAccumulatedRewards_msgSender();
      let accumulatedRewardsV2 = await this.stakeV2.connect(this.signers.user1).userAccumulatedRewards_msgSender();

      console.log("Before rewards migration ...");
      console.log("claimableRewardsV1   =", claimableRewardsV1);
      console.log("accumulatedRewardsV1 =", accumulatedRewardsV1);
      console.log("accumulatedRewardsV2 =", accumulatedRewardsV2);

      expect(claimableRewardsV1).to.eq(0);

      // migrate (accumulated) rewards from v1 to v2
      const tx2 = await this.stakeV2.connect(this.signers.user1).migrateRewards();
      await tx2.wait();

      expect(await this.stake.userAccumulatedRewards(this.signers.user1)).to.eq(0);
      expect(await this.stakeV2.userAccumulatedRewards(this.signers.user1)).to.eq(
        accumulatedRewardsV1 + accumulatedRewardsV2);

      // calling migrateRewards a 2nd time should not work and should not add any rewards in stakeV2
      const tx3 = await this.stakeV2.connect(this.signers.user1).migrateRewards();
      await tx3.wait();

      expect(await this.stake.userAccumulatedRewards(this.signers.user1)).to.eq(0);
      expect(await this.stakeV2.userAccumulatedRewards(this.signers.user1)).to.eq(
        accumulatedRewardsV1 + accumulatedRewardsV2);

      claimableRewardsV1 = await this.stake.connect(this.signers.user1).userClaimableRewards_msgSender();
      accumulatedRewardsV1 = await this.stake.connect(this.signers.user1).userAccumulatedRewards_msgSender();
      accumulatedRewardsV2 = await this.stakeV2.connect(this.signers.user1).userAccumulatedRewards_msgSender();

      console.log("After rewards migration ...");
      console.log("claimableRewardsV1   =", claimableRewardsV1);
      console.log("accumulatedRewardsV1 =", accumulatedRewardsV1);
      console.log("accumulatedRewardsV2 =", accumulatedRewardsV2);
      // });

      // it("stake tokens from stake v1 into stakeV2", async function () {
      const stakeBalance = await this.stakeV2.connect(this.signers.user1).stakeAmount_msgSender();
      console.log("current staking balance in v2 :", stakeBalance);
      console.log("now staking additional amount :", stakeAmountPrev);

      const tx4 = await this.stakeV2.connect(this.signers.user1).stakelockTimeChoice(stakeAmountPrev, 1);
      await tx4.wait();

      const stakeAmountFinal = await this.stakeV2.connect(this.signers.user1).stakeAmount_msgSender();
      console.log("final staking balance in v2   :", stakeAmountFinal);

      expect(stakeAmountFinal).to.eq(stakeBalance + stakeAmountPrev);
    });

  });
});
