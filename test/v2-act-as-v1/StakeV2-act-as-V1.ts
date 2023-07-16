import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, network } from "hardhat";

import type { Signers } from "../types";
import { deployStakeV2Fixture } from "./StakeV2-act-as-V1.fixture";
import { shouldBehaveLikeStakeV2 } from "./StakeV2-act-as-V1.behavior";

import { expect } from "chai";
import * as path from "path";

const PERIOD_HARDHAT = 24 * 60 * 60; // 1 day (simulated time periods) on hardhat
const PERIOD_BLOCKCHAIN = 60; // 1 minute on "real" blockchains
const timePeriod = network.name == "hardhat" ? PERIOD_HARDHAT : PERIOD_BLOCKCHAIN;
const lockPeriod = 7 * timePeriod;

const TIMEOUT_BLOCKCHAIN_ms = 10 * 60 * 1000; // 10 minutes

const filenameHeader = path.basename(__filename).concat(" ").padEnd(80, "=").concat("\n");

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
    if (deployerBalance < (ethers.parseUnits("1.0"))) {
      console.error("ERROR: Balance too low");
      process.exit(1);
    }

    console.log("user1    account           :", await this.signers.user1.getAddress());

    const user1Balance = await ethers.provider.getBalance(this.signers.user1);
    console.log("user1    account balance   :", ethers.formatUnits(user1Balance));
    if (user1Balance < (ethers.parseUnits("1.0"))) {
      console.error("ERROR: Balance too low");
      process.exit(1);
    }

    this.loadFixture = loadFixture;

    const { stakeToken, rewardToken, stakeV2 } = await this.loadFixture(deployStakeV2Fixture);

    this.stakeToken = stakeToken;
    this.rewardToken = rewardToken;
    this.stakeV2 = stakeV2;

    console.log("stakeToken        deployed to :", await this.stakeToken.getAddress());
    console.log("rewardToken       deployed to :", await this.rewardToken.getAddress());
    console.log("stake contract v2 deployed to :", await this.stakeV2.getAddress());
  });

  shouldBehaveLikeStakeV2(timePeriod);

  // this.rewardToken = this.stakeToken; // TEST TODO
  // basicTests(timePeriod);

  // accidentally send a token directly to the contract ... admin can recover them
  // we (re)use the reward token, but it could be any token, except the stake token
  describe("test removeOtherERC20Tokens()", function () {
    if (network.name != "hardhat") this.timeout(TIMEOUT_BLOCKCHAIN_ms);

    it("a token is accidentally being send directly to staking contract => recover", async function () {
      const amount: bigint = 10n ** 18n;
      const balance = await this.rewardToken.balanceOf(this.signers.admin);

      const tx1 = await this.rewardToken.connect(this.signers.admin).transfer(this.stakeV2, amount);
      await tx1.wait();

      expect(await this.rewardToken.balanceOf(this.signers.admin)).to.equal(balance - amount);

      const tx2 = await this.stakeV2.connect(this.signers.admin).removeOtherERC20Tokens(this.rewardToken);
      await tx2.wait();

      expect(await this.rewardToken.balanceOf(this.signers.admin)).to.equal(balance);
    });
  });

});
