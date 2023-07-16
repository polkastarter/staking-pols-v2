// import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";

import type { PolkastarterToken } from "../../types/contracts/test/PolkastarterToken.sol/PolkastarterToken";
import type { PolkastarterToken__factory } from "../../types/factories/contracts/test/PolkastarterToken.sol/PolkastarterToken__factory";

import type { RewardToken } from "../../types/contracts/test/RewardToken";
import type { RewardToken__factory } from "../../types/factories/contracts/test/RewardToken__factory";

import type { PolsStake } from "../../types/contracts/test/PolsStake";
import type { PolsStake__factory } from "../../types/factories/contracts/test/PolsStake__factory";

export async function deployStakeV1Fixture(): Promise<{ stakeToken: PolkastarterToken, rewardToken: RewardToken, stakeV1: PolsStake }> {
  const signers = await ethers.getSigners();
  const admin = signers[0];

  // deploy stake token
  const stakeTokenFactory: PolkastarterToken__factory = <PolkastarterToken__factory>await ethers.getContractFactory("PolkastarterToken", admin);
  const stakeToken: PolkastarterToken = <PolkastarterToken>await stakeTokenFactory.deploy(admin);
  await stakeToken.waitForDeployment();


  // deploy reward token
  const rewardTokenFactory: RewardToken__factory = <RewardToken__factory>await ethers.getContractFactory("RewardToken");
  const rewardToken = <RewardToken>await rewardTokenFactory.connect(admin).deploy();
  await rewardToken.waitForDeployment();


  // deploy staking v1
  const lockTimePeriod: number = 7 * 24 * 60 * 60;
  const stakeV1Factory: PolsStake__factory = <PolsStake__factory>await ethers.getContractFactory("PolsStake");
  const stakeV1: PolsStake = <PolsStake>await stakeV1Factory.connect(admin).deploy(stakeToken, lockTimePeriod);
  await stakeV1.waitForDeployment();


  return { stakeToken, rewardToken, stakeV1 };
}
