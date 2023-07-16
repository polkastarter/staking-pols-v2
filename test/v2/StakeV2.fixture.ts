// import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";

import type { PolkastarterToken } from "../../types/contracts/test/PolkastarterToken.sol/PolkastarterToken";
import type { PolkastarterToken__factory } from "../../types/factories/contracts/test/PolkastarterToken.sol/PolkastarterToken__factory";

import type { RewardToken } from "../../types/contracts/test/RewardToken";
import type { RewardToken__factory } from "../../types/factories/contracts/test/RewardToken__factory";

import type { PolsStakeV2 } from "../../types/contracts/PolsStakeV2";
import type { PolsStakeV2__factory } from "../../types/factories/contracts/PolsStakeV2__factory";

export async function deployStakeV2Fixture(): Promise<{ stakeToken: PolkastarterToken, rewardToken: RewardToken, stakeV2: PolsStakeV2 }> {
    const signers = await ethers.getSigners();
    const admin = signers[0];

    // deploy stake token
    const stakeTokenFactory: PolkastarterToken__factory = <PolkastarterToken__factory>await ethers.getContractFactory("PolkastarterToken", admin);
    const stakeToken: PolkastarterToken = <PolkastarterToken>await stakeTokenFactory.deploy(admin.address);
    await stakeToken.waitForDeployment();

    // deploy reward token
    const rewardTokenFactory: RewardToken__factory = <RewardToken__factory>await ethers.getContractFactory("RewardToken");
    const rewardToken = <RewardToken>await rewardTokenFactory.connect(admin).deploy();
    await rewardToken.waitForDeployment();

    // deploy staking v2
    const stakeV2Factory: PolsStakeV2__factory = <PolsStakeV2__factory>await ethers.getContractFactory("PolsStakeV2");
    const stakeV2: PolsStakeV2 = <PolsStakeV2>await stakeV2Factory.connect(admin).deploy(stakeToken);
    await stakeV2.waitForDeployment();

    return { stakeToken, rewardToken, stakeV2 };
}
