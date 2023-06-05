// import hre from "hardhat";
import { ethers, network } from "hardhat";

import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import type { PolkastarterToken } from "../../types/contracts/test/PolkastarterToken.sol/PolkastarterToken";
import type { PolkastarterToken__factory } from "../../types/factories/contracts/test/PolkastarterToken.sol/PolkastarterToken__factory";

import type { RewardToken } from "../../types/contracts/test/RewardToken";
import type { RewardToken__factory } from "../../types/factories/contracts/test/RewardToken__factory";

import type { PolsStake } from "../../types/contracts/test/PolsStake";
import type { PolsStake__factory } from "../../types/factories/contracts/test/PolsStake__factory";

import { Signers } from "../types";
import { basicTests } from "./PolsStake.basicTests";
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

    // deploy stake token
    const stakeTokenFactory: PolkastarterToken__factory = <PolkastarterToken__factory>await ethers.getContractFactory("PolkastarterToken", admin);
    const pols: PolkastarterToken = <PolkastarterToken>await stakeTokenFactory.deploy(admin.address);
    await pols.deployed();
    this.stakeToken = pols;
    console.log("stakeToken     deployed to :", this.stakeToken.address);

    // this.rewardToken = this.stakeToken; // TEST TODO
    // console.log("rewardToken     deployed to :", this.rewardToken.address);

    // deploy reward token we will use later for recovery test
    const rewardTokenFactory: RewardToken__factory = <RewardToken__factory>await ethers.getContractFactory("RewardToken");
    this.rewardToken = <RewardToken>await rewardTokenFactory.connect(admin).deploy();
    await this.rewardToken.deployed();

    // deploy staking contract
    const polsStakeFactory: PolsStake__factory = <PolsStake__factory>await ethers.getContractFactory("PolsStake");
    this.stake = <PolsStake>await polsStakeFactory.connect(admin).deploy(this.stakeToken.address, lockPeriod);
    await this.stake.deployed();

    console.log("stake contract deployed to :", this.stake.address);
  });

  basicTests(timePeriod);

  // this.rewardToken = this.stakeToken; // TEST TODO
  // basicTests(timePeriod);

  // "accidentally send a token directly to the contract ... admin can recover them"
  describe("test removeOtherERC20Tokens()", function () {
    if (network.name != "hardhat") this.timeout(TIMEOUT_BLOCKCHAIN_ms);

    it("a token is accidentally being send directly to staking contract => recover", async function () {
      const amount = "10" + "0".repeat(18);
      const balance = await this.rewardToken.balanceOf(this.signers.admin.address);

      const tx1 = await this.rewardToken.connect(this.signers.admin).transfer(this.stake.address, amount);
      await tx1.wait();

      expect(await this.rewardToken.balanceOf(this.signers.admin.address)).to.equal(balance.sub(amount));

      const tx2 = await this.stake.connect(this.signers.admin).removeOtherERC20Tokens(this.rewardToken.address);
      await tx2.wait();

      expect(await this.rewardToken.balanceOf(this.signers.admin.address)).to.equal(balance);
    });
  });

});
