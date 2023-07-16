import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/dist/src/signer-with-address";

import type { PolkastarterToken } from "../types/contracts/test/PolkastarterToken.sol/PolkastarterToken";
import type { RewardToken } from "../types/contracts/test/RewardToken";
import type { IERC20 } from "../types/@openzeppelin/contracts/token/ERC20/IERC20";
import type { IERC20Metadata } from "../types/@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata";

import type { PolsStake } from "../types/contracts/test/PolsStake";
import type { PolsStakeV2 } from "../types/contracts/PolsStakeV2";

type Fixture<T> = () => Promise<T>;

declare module "mocha" {
    export interface Context {
        stakeToken: IERC20 & IERC20Metadata;
        rewardToken: IERC20 & IERC20Metadata;
        stake: PolsStake;
        stakeV2: PolsStakeV2;

        loadFixture: <T>(fixture: Fixture<T>) => Promise<T>;
        signers: Signers;
    }
}

export interface Signers {
    admin: SignerWithAddress;
    user1: SignerWithAddress;
    user2: SignerWithAddress;
}
