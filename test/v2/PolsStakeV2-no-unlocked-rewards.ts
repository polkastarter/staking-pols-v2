
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, network } from "hardhat";

import type { Signers } from "../types";
import { deployStakeV2Fixture } from "./StakeV2.fixture";

import * as path from "path";

import { timePeriod } from "../libs/BlockTimeHelper";

import { basicTestsV2 } from "./PolsStakeV2.basicTests";

const TIMEOUT_BLOCKCHAIN_ms = 10 * 60 * 1000; // 10 minutes

const filenameHeader = path.basename(__filename).concat(" ").padEnd(80, "=").concat("\n");

describe(filenameHeader, function () {
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
      console.error("ERROR: ETH Balance too low");
      process.exit(1);
    }

    console.log("user1    account           :", await this.signers.user1.getAddress());

    const user1Balance = await ethers.provider.getBalance(this.signers.user1);
    console.log("user1    account balance   :", ethers.formatUnits(user1Balance));
    if (user1Balance < ethers.parseUnits("1.0")) {
      console.error("ERROR: ETH Balance too low");
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


  /**
   * set to "v2 mode" and run test suite
   * lockedRewardsEnabled  = true
   * unlockedRewardsFactor = 0 (no rewards outside of locked period)
   */
  basicTestsV2(timePeriod(), true, 0);

});
