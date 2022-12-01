// eslint-disable @typescript-eslint/no-explicit-any
import { Fixture } from "ethereum-waffle";

import { Signers } from "./";

import { PolkastarterToken } from "../typechain/PolkastarterToken";
// import { RewardToken } from "../typechain/RewardToken";
import { IERC20 } from "../typechain/IERC20";
import { IERC20Metadata } from "../typechain/IERC20Metadata";

import { PolsStake } from "../typechain/PolsStake";
import { PolsStakeV2 } from "../typechain/PolsStakeV2";

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
