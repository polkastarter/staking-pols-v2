import { ethers } from "hardhat";
import { BigNumberish } from "ethers";
import { expect } from "chai";

import type { Signers } from "../types";
import type { PolsStakeV2 } from "../../types/contracts/PolsStakeV2";
import type { PolsStakeV2__factory } from "../../types/factories/contracts/PolsStakeV2__factory";

import * as path from "path";

const fakeTokenAddress: string = "0x1111111111111111111111111111111111111111";

const days = 24 * 60 * 60;

// Parameter test cases
// function _userClaimableRewardsCalculation(
//     uint256 user_stakeAmount,
//     uint256 user_stakeTime,
//     uint256 user_unlockTime,
//     uint256 block_timestamp,
//     uint256 endTime,
//     bool    lockedRewards
//     bool    lockedRewardsCurrent // true => only calculate locked rewards up to t0
// ) public view returns (uint256)

const DECIMALS = 18;
const DECMULBN = 10 ** DECIMALS;
const amount = 250n * BigInt(DECMULBN);
const REWARDS_DIV = 1000000;

type Parameter = [bigint, number, number, number, number, boolean, boolean, number];

/**
 * Testcases for unlockedRewardsFactor = 0.5
 */
// prettier-ignore
const testCases: [Parameter, bigint][] = [
  //  amount, stk , unl, blk, end, lckrew, expectedResult
  // lockedRewardsEnabled = false ----------------------------------------------------------------------------
  [[0n, 10, 20, 12, 100, false, false, REWARDS_DIV], 0n],              // nothing staked
  [[amount, 10, 20, 10, 100, false, false, REWARDS_DIV], 0n], // staked  0 days within lock period, user_stakeTime == block_timestamp
  [[amount, 10, 20, 12, 100, false, false, REWARDS_DIV], amount * BigInt(2 / 2)], // staked  2 days within lock period
  [[amount, 10, 20, 16, 100, false, false, REWARDS_DIV], amount * BigInt(6 / 2)], // staked  6 days within lock period
  [[amount, 10, 20, 30, 100, false, false, REWARDS_DIV], amount * BigInt(10)], // staked 10 days past unlock time
  [[amount, 10, 20, 200, 100, false, false, REWARDS_DIV], amount * BigInt(45)], // staked past end of rewards scheme

  // good cases (from 24 permutations - redundant actually)
  [[amount, 10, 24, 60, 100, false, false, REWARDS_DIV], amount * BigInt((60 - 10) / 2)],  //   [ 'stake', 'unlock', 'current', 'end' ]
  [[amount, 10, 24, 100, 60, false, false, REWARDS_DIV], amount * BigInt((60 - 10) / 2)],  //   [ 'stake', 'unlock', 'end', 'current' ]
  [[amount, 10, 60, 24, 100, false, false, REWARDS_DIV], amount * BigInt((24 - 10) / 2)],  //   [ 'stake', 'current', 'unlock', 'end' ]
  [[amount, 10, 60, 100, 24, false, false, REWARDS_DIV], amount * BigInt((24 - 10) / 2)],  //   [ 'stake', 'current', 'end', 'unlock' ]
  [[amount, 10, 100, 24, 60, false, false, REWARDS_DIV], amount * BigInt((24 - 10) / 2)],  //   [ 'stake', 'end', 'unlock', 'current' ]
  [[amount, 10, 100, 60, 24, false, false, REWARDS_DIV], amount * BigInt((24 - 10) / 2)],  //   [ 'stake', 'end', 'current', 'unlock' ]

  // reward period ended before staking
  [[amount, 24, 60, 100, 10, false, false, REWARDS_DIV], 0n],  //   [ 'end', 'stake', 'unlock', 'current']
  [[amount, 24, 100, 60, 10, false, false, REWARDS_DIV], 0n],  //   [ 'end', 'stake', 'current', 'unlock']

  // lockedRewardsEnabled = true -----------------------------------------------------------------------------
  [[0n, 10, 20, 12, 100, true, false, REWARDS_DIV], 0n],                   // nothing staked

  [[amount, 10, 20, 10, 100, true, false, REWARDS_DIV], amount * BigInt(10)],      // staked  0 days within lock period, user_stakeTime == block_timestamp
  [[amount, 10, 20, 12, 100, true, false, REWARDS_DIV], amount * BigInt(10)],      // staked  2 days within lock period
  [[amount, 10, 20, 12, 100, true, true, REWARDS_DIV], amount * BigInt(2)],      // staked  2 days within lock period

  [[amount, 10, 20, 15, 100, true, false, REWARDS_DIV], amount * BigInt(10)],      // staked  5 days within lock period
  [[amount, 10, 20, 15, 100, true, true, REWARDS_DIV], amount * BigInt(5)],      // staked  5 days within lock period

  [[amount, 10, 20, 30, 100, true, false, REWARDS_DIV], amount * BigInt((10 + 5))], // staked 10 days past unlock time
  [[amount, 10, 20, 30, 100, true, true, REWARDS_DIV], amount * BigInt((10 + 5))], // staked 10 days past unlock time

  [[amount, 10, 20, 200, 100, true, false, REWARDS_DIV], amount * BigInt((10 + 40))], // staked past end of rewards scheme
  [[amount, 10, 20, 200, 100, true, true, REWARDS_DIV], amount * BigInt((10 + 40))], // staked past end of rewards scheme

  [[amount, 10, 200, 300, 150, true, false, REWARDS_DIV], amount * BigInt((150 - 10))],          // endTime < unlockTime < blockTime
  [[amount, 10, 200, 300, 250, true, false, REWARDS_DIV], amount * BigInt((200 - 10 + 50 / 2))],  // unlockTime < endTime < blockTime
  [[amount, 10, 200, 300, 350, true, false, REWARDS_DIV], amount * BigInt((200 - 10 + 100 / 2))],  // unlockTime < blockTime < endTime

  [[amount, 10, 200, 300, 150, true, true, REWARDS_DIV], amount * BigInt((150 - 10))],          // endTime < unlockTime < blockTime
  [[amount, 10, 200, 300, 250, true, true, REWARDS_DIV], amount * BigInt((200 - 10 + 50 / 2))],  // unlockTime < endTime < blockTime
  [[amount, 10, 200, 300, 350, true, true, REWARDS_DIV], amount * BigInt((200 - 10 + 100 / 2))],  // unlockTime < blockTime < endTime


  // *** lockedRewardsCurrent = false ***
  // all 24 permutations ... (not considering lockedRewardsCurrent)
  // good cases (from 24 permutations - redundant actually)
  //amount, stk , unl, blk, end, lckrew, lRC ,  expectedResult
  [[amount, 10, 24, 60, 100, true, false, REWARDS_DIV], amount * BigInt(24 - 10 + (60 - 24) / 2)],  //   [ 'stake', 'unlock', 'current', 'end' ]
  [[amount, 10, 24, 100, 60, true, false, REWARDS_DIV], amount * BigInt(24 - 10 + (60 - 24) / 2)],  //   [ 'stake', 'unlock', 'end', 'current' ]
  [[amount, 10, 60, 24, 100, true, false, REWARDS_DIV], amount * BigInt(60 - 10)],  //   [ 'stake', 'current', 'unlock', 'end' ]
  [[amount, 10, 60, 100, 24, true, false, REWARDS_DIV], amount * BigInt(24 - 10)],  //   [ 'stake', 'end', 'unlock' , 'current']
  [[amount, 10, 100, 24, 60, true, false, REWARDS_DIV], amount * BigInt(60 - 10)],  //   [ 'stake', 'current', 'end', 'unlock' ]
  [[amount, 10, 100, 60, 24, true, false, REWARDS_DIV], amount * BigInt(24 - 10)],  //   [ 'stake', 'end', 'current', 'unlock' ]

  // reward period ended before staking
  [[amount, 24, 60, 100, 10, true, false, REWARDS_DIV], 0n],  //   [ 'end', 'stake', 'unlock', 'current']
  [[amount, 24, 100, 60, 10, true, false, REWARDS_DIV], 0n],  //   [ 'end', 'stake', 'current', 'unlock']

  // currentTime < stakeTime
  [[amount, 60, 100, 24, 10, true, false, REWARDS_DIV], 0n],
  [[amount, 24, 60, 10, 100, true, false, REWARDS_DIV], 0n],
  [[amount, 24, 100, 10, 60, true, false, REWARDS_DIV], 0n],
  [[amount, 60, 24, 10, 100, true, false, REWARDS_DIV], 0n],
  [[amount, 60, 100, 10, 24, true, false, REWARDS_DIV], 0n],
  [[amount, 100, 24, 10, 60, true, false, REWARDS_DIV], 0n],
  [[amount, 100, 60, 10, 24, true, false, REWARDS_DIV], 0n],

  // unlockTime < stakeTime
  [[amount, 24, 10, 60, 100, true, false, REWARDS_DIV], 0n],
  [[amount, 24, 10, 100, 60, true, false, REWARDS_DIV], 0n],
  [[amount, 60, 10, 24, 100, true, false, REWARDS_DIV], 0n],
  [[amount, 60, 10, 100, 24, true, false, REWARDS_DIV], 0n],
  [[amount, 100, 10, 24, 60, true, false, REWARDS_DIV], 0n],
  [[amount, 100, 10, 60, 24, true, false, REWARDS_DIV], 0n],
  [[amount, 60, 10, 24, 100, true, false, REWARDS_DIV], 0n],
  [[amount, 60, 10, 100, 24, true, false, REWARDS_DIV], 0n],
  [[amount, 60, 24, 100, 10, true, false, REWARDS_DIV], 0n],
  [[amount, 100, 24, 60, 10, true, false, REWARDS_DIV], 0n],
  [[amount, 100, 60, 24, 10, true, false, REWARDS_DIV], 0n],


  // *** lockedRewardsCurrent = true ***
  // good cases (from 24 permutations - redundant actually) - lockedRewardsCurrent = true
  //amount, stk , unl, blk, end, lckrew, lRC ,  expectedResult
  [[amount, 10, 24, 60, 100, true, true, REWARDS_DIV], amount * BigInt(24 - 10 + (60 - 24) / 2)],  //   [ 'stake', 'unlock', 'current', 'end' ]
  [[amount, 10, 24, 100, 60, true, true, REWARDS_DIV], amount * BigInt(24 - 10 + (60 - 24) / 2)],  //   [ 'stake', 'unlock', 'end', 'current' ]
  [[amount, 10, 60, 24, 100, true, true, REWARDS_DIV], amount * BigInt(24 - 10)],  //   [ 'stake', 'current', 'unlock', 'end' ]
  [[amount, 10, 60, 100, 24, true, true, REWARDS_DIV], amount * BigInt(24 - 10)],  //   [ 'stake', 'end', 'unlock' , 'current']
  [[amount, 10, 100, 24, 60, true, true, REWARDS_DIV], amount * BigInt(24 - 10)],  //   [ 'stake', 'current', 'end', 'unlock' ]
  [[amount, 10, 100, 60, 24, true, true, REWARDS_DIV], amount * BigInt(24 - 10)],  //   [ 'stake', 'end', 'current', 'unlock' ]

  // reward period ended before staking
  [[amount, 24, 60, 100, 10, true, true, REWARDS_DIV], 0n],  //   [ 'end', 'stake', 'unlock', 'current']
  [[amount, 24, 100, 60, 10, true, true, REWARDS_DIV], 0n],  //   [ 'end', 'stake', 'current', 'unlock']

  // currentTime < stakeTime
  [[amount, 60, 100, 24, 10, true, true, REWARDS_DIV], 0n],
  [[amount, 24, 60, 10, 100, true, true, REWARDS_DIV], 0n],
  [[amount, 24, 100, 10, 60, true, true, REWARDS_DIV], 0n],
  [[amount, 60, 24, 10, 100, true, true, REWARDS_DIV], 0n],
  [[amount, 60, 100, 10, 24, true, true, REWARDS_DIV], 0n],
  [[amount, 100, 24, 10, 60, true, true, REWARDS_DIV], 0n],
  [[amount, 100, 60, 10, 24, true, true, REWARDS_DIV], 0n],

  // unlockTime < stakeTime
  [[amount, 24, 10, 60, 100, true, true, REWARDS_DIV], 0n],
  [[amount, 24, 10, 100, 60, true, true, REWARDS_DIV], 0n],
  [[amount, 60, 10, 24, 100, true, true, REWARDS_DIV], 0n],
  [[amount, 60, 10, 100, 24, true, true, REWARDS_DIV], 0n],
  [[amount, 100, 10, 24, 60, true, true, REWARDS_DIV], 0n],
  [[amount, 100, 10, 60, 24, true, true, REWARDS_DIV], 0n],
  [[amount, 60, 10, 24, 100, true, true, REWARDS_DIV], 0n],
  [[amount, 60, 10, 100, 24, true, true, REWARDS_DIV], 0n],
  [[amount, 60, 24, 100, 10, true, true, REWARDS_DIV], 0n],
  [[amount, 100, 24, 60, 10, true, true, REWARDS_DIV], 0n],
  [[amount, 100, 60, 24, 10, true, true, REWARDS_DIV], 0n],
];

/**
 * Testcases for unlockedRewardsFactor = 0
 */
// prettier-ignore
const testCases_0: [Parameter, BigNumberish][] = [
  //   amount,   stake,  unlock, blkTime,  endTime, lckrew, expectedResult
  // lockedRewardsEnabled = false ----------------------------------------------------------------------------
  [[0n, 10, 20, 12, 100, false, false, REWARDS_DIV], 0n], // nothing staked
  [[amount, 10, 20, 12, 100, false, false, REWARDS_DIV], 0n], // staked  2 days within lock period
  [[amount, 10, 20, 15, 100, false, false, REWARDS_DIV], 0n], // staked  5 days within lock period
  [[amount, 10, 20, 30, 100, false, false, REWARDS_DIV], 0n], // staked 10 days past unlock time
  [[amount, 10, 20, 200, 100, false, false, REWARDS_DIV], 0n], // staked past end of rewards scheme

  // good cases (from 24 permutations - redundant actually)
  [[amount, 10, 24, 60, 100, false, false, REWARDS_DIV], 0n],  //   [ 'stake', 'unlock', 'current', 'end' ]
  [[amount, 10, 24, 100, 60, false, false, REWARDS_DIV], 0n],  //   [ 'stake', 'unlock', 'end', 'current' ]
  [[amount, 10, 60, 24, 100, false, false, REWARDS_DIV], 0n],  //   [ 'stake', 'current', 'unlock', 'end' ]
  [[amount, 10, 60, 100, 24, false, false, REWARDS_DIV], 0n],  //   [ 'stake', 'current', 'end', 'unlock' ]
  [[amount, 10, 100, 24, 60, false, false, REWARDS_DIV], 0n],  //   [ 'stake', 'end', 'unlock', 'current' ]
  [[amount, 10, 100, 60, 24, false, false, REWARDS_DIV], 0n],  //   [ 'stake', 'end', 'current', 'unlock' ]

  // reward period ended before staking
  [[amount, 24, 60, 100, 10, false, false, REWARDS_DIV], 0n],  //   [ 'end', 'stake', 'unlock', 'current']
  [[amount, 24, 100, 60, 10, false, false, REWARDS_DIV], 0n],  //   [ 'end', 'stake', 'current', 'unlock']

  // lockedRewardsEnabled = true -----------------------------------------------------------------------------
  [[0n, 10, 20, 12, 100, true, false, REWARDS_DIV], 0n],                 // nothing staked
  [[amount, 10, 20, 12, 100, true, false, REWARDS_DIV], amount * BigInt(10)],     // staked  2 days within lock period
  [[amount, 10, 20, 15, 100, true, false, REWARDS_DIV], amount * BigInt(10)],      // staked  5 days within lock period
  [[amount, 10, 20, 30, 100, true, false, REWARDS_DIV], amount * BigInt((10 + 0))], // staked 10 days past unlock time
  [[amount, 10, 20, 200, 100, true, false, REWARDS_DIV], amount * BigInt((10 + 0))], // staked past end of rewards scheme
  [[amount, 10, 200, 150, 100, true, false, REWARDS_DIV], amount * BigInt(90)],     // unlock time past end of rewards scheme
  [[amount, 10, 200, 300, 100, true, false, REWARDS_DIV], amount * BigInt(90)],     // unlock time past end of rewards scheme
  [[amount, 10, 200, 300, 150, true, false, REWARDS_DIV], amount * BigInt((150 - 10))],     // endTime < unlockTime < blockTime
  [[amount, 10, 200, 300, 250, true, false, REWARDS_DIV], amount * BigInt((200 - 10 + 0))], // unlockTime < endTime < blockTime
  [[amount, 10, 200, 300, 350, true, false, REWARDS_DIV], amount * BigInt((200 - 10 + 0))], // unlockTime < blockTime < endTime

  // good cases (from 24 permutations - redundant actually)
  [[amount, 10, 24, 60, 100, true, false, REWARDS_DIV], amount * BigInt(24 - 10)],  //   [ 'stake', 'unlock', 'current', 'end' ]
  [[amount, 10, 24, 100, 60, true, false, REWARDS_DIV], amount * BigInt(24 - 10)],  //   [ 'stake', 'unlock', 'end', 'current' ]
  [[amount, 10, 60, 24, 100, true, false, REWARDS_DIV], amount * BigInt(60 - 10)],  //   [ 'stake', 'current', 'unlock', 'end' ]
  [[amount, 10, 60, 100, 24, true, false, REWARDS_DIV], amount * BigInt(24 - 10)],  //   [ 'stake', 'current', 'end', 'unlock' ]
  [[amount, 10, 100, 24, 60, true, false, REWARDS_DIV], amount * BigInt(60 - 10)],  //   [ 'stake', 'end', 'unlock', 'current' ]
  [[amount, 10, 100, 60, 24, true, false, REWARDS_DIV], amount * BigInt(24 - 10)],  //   [ 'stake', 'end', 'current', 'unlock' ]

  // reward period ended before staking
  [[amount, 24, 60, 100, 10, true, false, REWARDS_DIV], 0n],  //   [ 'end', 'stake', 'unlock', 'current']
  [[amount, 24, 100, 60, 10, true, false, REWARDS_DIV], 0n],  //   [ 'end', 'stake', 'current', 'unlock']

  // not testing revert cases again ...
];

const filenameHeader = path.basename(__filename).concat(" ").padEnd(80, "=").concat("\n");

describe("PolsStakeV2 : " + filenameHeader, function () {

  before(async function () {
    const signers = await ethers.getSigners();
    this.signers = {} as Signers;
    this.signers.admin = signers[0];
    console.log("fakeTokenAddress", fakeTokenAddress)
    // deploy staking v2
    // const lockTimePeriod: number = 7 * 24 * 60 * 60;
    const stakeV2Factory: PolsStakeV2__factory = <PolsStakeV2__factory>await ethers.getContractFactory("PolsStakeV2");
    const stakeV2: PolsStakeV2 = <PolsStakeV2>await stakeV2Factory.connect(this.signers.admin).deploy(fakeTokenAddress);
    await stakeV2.waitForDeployment();
    this.stakeV2 = stakeV2;
    console.log("stake contract deployed to :", await this.stakeV2.getAddress());
  });

  /**
   * test cases : unlockedRewardsFactor = 0.5
   */

  it("set unlockedRewardsFactor = 0.5 (= REWARDS_DIV / 2)", async function () {
    const rewards_div = await this.stakeV2.REWARDS_DIV();
    expect(rewards_div).to.gte(2); // should not be 0 or 1
    expect(rewards_div % 2n).to.eq(0); // should be an even number to avoid rounding errors

    // set unlockedRewardsFactor = 0.5
    const tx = await this.stakeV2.connect(this.signers.admin).setUnlockedRewardsFactor(rewards_div / 2n);
    await tx.wait();

    expect(await this.stakeV2.unlockedRewardsFactor()).to.equal(rewards_div / 2n);
  });

  it("calculates rewards correctly for unlockedRewardsFactor = 0.5", async function () {
    for (var testCase of testCases) {
      console.log(...testCase);
      // if (testCase[1] >= 0) {
      const reward = await this.stakeV2._userClaimableRewardsCalculation(...testCase[0]);
      expect(reward).to.eq(testCase[1]);
      // } else {
      //   await expect(this.stakeV2._userClaimableRewardsCalculation(...testCase[0n])).to.be.reverted;
      // }
    }
  });

  /**
   * test cases : unlockedRewardsFactor = 0
   */

  it("set unlockedRewardsFactor = 0", async function () {
    const tx = await this.stakeV2.connect(this.signers.admin).setUnlockedRewardsFactor(0);
    await tx.wait();

    expect(await this.stakeV2.unlockedRewardsFactor()).to.equal(0);
  });

  it("calculates rewards correctly for unlockedRewardsFactor = 0", async function () {
    for (var testCase of testCases_0) {
      console.log(...testCase);
      const reward = await this.stakeV2._userClaimableRewardsCalculation(...testCase[0]);
      expect(reward).to.eq(testCase[1]);
    }
  });
});
