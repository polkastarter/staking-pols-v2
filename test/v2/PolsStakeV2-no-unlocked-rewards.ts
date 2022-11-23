import hre from "hardhat";
import { expect } from "chai";
import { Artifact } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { PolkastarterToken } from "../../typechain/PolkastarterToken";
import { RewardToken } from "../../typechain/RewardToken";
import { PolsStakeV2 } from "../../typechain/PolsStakeV2";

import { Signers } from "../../types";
import { basicTestsV2 } from "./PolsStakeV2.basicTests";

import * as path from "path";

// https://ethereum-waffle.readthedocs.io
const { deployContract } = hre.waffle;

// https://docs.ethers.io/v5/api/utils/bignumber/
// const { BigNumber } = hre.ethers;

// const DECIMALS = 18;
// const DECMULBN = BigNumber.from(10).pow(DECIMALS);

const PERIOD_HARDHAT = 24 * 60 * 60; // 1 day (simulated time periods) on hardhat
const PERIOD_BLOCKCHAIN = 60; // 1 minute on "real" blockchains
const timePeriod = hre.network.name == "hardhat" ? PERIOD_HARDHAT : PERIOD_BLOCKCHAIN;
const lockPeriod = 7 * timePeriod;

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

    // deploy staking contract
    const stakeArtifact: Artifact = await hre.artifacts.readArtifact("PolsStakeV2");
    this.stakeV2 = <PolsStakeV2>await deployContract(this.signers.admin, stakeArtifact, [this.stakeToken.address]);
    await this.stakeV2.deployed();
    console.log("stake contract deployed to :", this.stakeV2.address);
  });

  // set to v2 mode
  // lockedRewardsEnabled  = true
  // unlockedRewardsFactor = none
  basicTestsV2(timePeriod, true, 0);

  describe("test : removeOtherERC20Tokens()", function () {
    it("otherToken is accidently being send directly to staking contract => recover", async function () {
      // deploy other token (use Reward Token contract)
      const rewardTokenArtifact: Artifact = await hre.artifacts.readArtifact("RewardToken");
      this.otherToken = <RewardToken>await deployContract(this.signers.admin, rewardTokenArtifact, []);
      await this.otherToken.deployed();
      console.log("otherToken     deployed to :", this.otherToken.address);

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
});
