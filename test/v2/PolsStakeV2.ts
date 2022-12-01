import hre from "hardhat";
import { expect } from "chai";
import { Artifact } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { PolkastarterToken } from "../../typechain/PolkastarterToken";
import { RewardToken } from "../../typechain/RewardToken";
import { PolsStake } from "../../typechain/PolsStake";
import { PolsStakeV2 } from "../../typechain/PolsStakeV2";

import { Signers } from "../../types";
import { basicTestsV2 } from "./PolsStakeV2.basicTests";

import * as path from "path";
import { BigNumber, BigNumberish } from "ethers";

import { timePeriod, getTimestamp, moveTime, waitTime, setTime, consoleLog_timestamp } from "../libs/BlockTimeHelper";

// https://ethereum-waffle.readthedocs.io
const { deployContract } = hre.waffle;

// https://docs.ethers.io/v5/api/utils/bignumber/
// const { BigNumber } = hre.ethers;

// const DECIMALS = 18;
// const DECMULBN = BigNumber.from(10).pow(DECIMALS);

const PERIOD_HARDHAT = 24 * 60 * 60; // 1 day (simulated time periods) on hardhat
const PERIOD_BLOCKCHAIN = 60; // 1 minute on "real" blockchains

const lockPeriod = 7 * timePeriod();

const REWARDS_DIV = 1_000_000;

const TIMEOUT_BLOCKCHAIN_ms = 10 * 60 * 1000; // 10 minutes

const filenameHeader = path.basename(__filename).concat(" ").padEnd(80, "=").concat("\n");

describe("PolsStakeV2 : " + filenameHeader, function () {
  before(async function () {
    if (hre.network.name != "hardhat") this.timeout(TIMEOUT_BLOCKCHAIN_ms);

    this.signers = {} as Signers;
    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    this.signers.admin = signers[0];
    this.signers.user1 = signers[1];
    this.signers.user2 = signers[2];

    const gasPriceString = await hre.ethers.provider.getGasPrice();
    console.log("Current gas price: " + gasPriceString);

    console.log("deployer account           :", this.signers.admin.address);

    const deployerBalance = await hre.ethers.provider.getBalance(this.signers.admin.address);
    console.log("deployer account balance   :", hre.ethers.utils.formatUnits(deployerBalance));
    if (deployerBalance.lt(hre.ethers.utils.parseUnits("1.0"))) {
      console.error("ERROR: Balance too low");
      process.exit(1);
    }

    console.log("user1    account           :", this.signers.user1.address);

    const user1Balance = await hre.ethers.provider.getBalance(this.signers.user1.address);
    console.log("user1    account balance   :", hre.ethers.utils.formatUnits(user1Balance));
    if (user1Balance.lt(hre.ethers.utils.parseUnits("1.0"))) {
      console.error("ERROR: Balance too low");
      process.exit(1);
    }

    const stakeTokenArtifact: Artifact = await hre.artifacts.readArtifact("PolkastarterToken");
    this.stakeToken = <PolkastarterToken>(
      await deployContract(this.signers.admin, stakeTokenArtifact, [this.signers.admin.address])
    );
    await this.stakeToken.deployed();
    console.log("stakeToken     deployed to :", this.stakeToken.address);

    // deploy reward token
    const rewardTokenArtifact: Artifact = await hre.artifacts.readArtifact("RewardToken");
    this.rewardToken = <RewardToken>await deployContract(this.signers.admin, rewardTokenArtifact, []);
    await this.rewardToken.deployed();
    console.log("rewardToken    deployed to :", this.rewardToken.address);

    // deploy staking contract v2
    const stakeArtifact: Artifact = await hre.artifacts.readArtifact("PolsStakeV2");
    this.stakeV2 = <PolsStakeV2>await deployContract(this.signers.admin, stakeArtifact, [this.stakeToken.address]);
    await this.stakeV2.deployed();
    console.log("stake contract deployed to :", this.stakeV2.address);
  });

  // set to v2 mode
  // lockedRewardsEnabled  = true
  // unlockedRewardsFactor = 0.5

  basicTestsV2(timePeriod(), true, REWARDS_DIV / 2);

  describe("test : removeOtherERC20Tokens()", function () {
    it("otherToken is accidently being send directly to staking contract => recover", async function () {
      // deploy other token (use Reward Token contract)
      const rewardTokenArtifact: Artifact = await hre.artifacts.readArtifact("RewardToken");
      this.otherToken = <RewardToken>await deployContract(this.signers.admin, rewardTokenArtifact, []);
      await this.otherToken.deployed();
      // console.log("otherToken     deployed to :", this.otherToken.address);

      const amount = "10" + "0".repeat(18);
      const balance = await this.otherToken.balanceOf(this.signers.admin.address);

      const tx1 = await this.otherToken.connect(this.signers.admin).transfer(this.stakeV2.address, amount);
      await tx1.wait();

      expect(await this.otherToken.balanceOf(this.signers.admin.address)).to.equal(balance.sub(amount));

      const tx2 = await this.stakeV2.connect(this.signers.admin).removeOtherERC20Tokens(this.otherToken.address);
      await tx2.wait();

      expect(await this.otherToken.balanceOf(this.signers.admin.address)).to.equal(balance);
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
      const stakeArtifact: Artifact = await hre.artifacts.readArtifact("PolsStake");
      this.stake = <PolsStake>(
        await deployContract(this.signers.admin, stakeArtifact, [this.stakeToken.address, lockPeriod])
      );
      await this.stake.deployed();
      // console.log("stake1 contract is at       :", this.stakeV2.address);
      // console.log("stake2 contract deployed to :", this.stake.address);
    });

    it("user approves stake token for PolsStake v1", async function () {
      startTime = await getTimestamp();
      console.log("startTime =", startTime);

      stakeTokenDecimals = await this.stakeToken.decimals();

      user1BalanceStart = await this.stakeToken.balanceOf(this.signers.user1.address);
      console.log("user1Balance =", hre.ethers.utils.formatUnits(user1BalanceStart, stakeTokenDecimals));

      const tx = await this.stakeToken.connect(this.signers.user1).approve(this.stake.address, user1BalanceStart);
      await tx.wait();

      const allowance = await this.stakeToken.allowance(this.signers.user1.address, this.stake.address);
      console.log("user1 approved allowance   =", hre.ethers.utils.formatUnits(allowance, stakeTokenDecimals));

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
      console.log("staking now ... stakeAmount =", hre.ethers.utils.formatUnits(stakeAmount, stakeTokenDecimals));

      const tx = await this.stake.connect(this.signers.user1).stake(stakeAmount);
      await tx.wait();

      blocktime = await getTimestamp();
      console.log("blocktime =", blocktime.toString());
      const stakeTime = await this.stake.connect(this.signers.user1).stakeTime_msgSender();
      console.log("stakeTime =", stakeTime.toString());
      expect(Math.abs(blocktime - stakeTime)).lte(60, "stakeTime not within 60 seconds of current blocktime");

      let stakeTime1 = blocktime;

      stakeBalance = await this.stake.stakeAmount(this.signers.user1.address);
      console.log("stakeBalance =", hre.ethers.utils.formatUnits(stakeBalance, stakeTokenDecimals));
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
