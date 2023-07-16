# TEST : PolsStakeV2-no-unlocked-rewards

## Goal

Test rewards of the new "V2-mode" where users only get rewards when within the lockperiod and do not get any rewards when their tokens are unlocked (= still staked after the end of the lock period).

## Setup

call `PolsStakeV2.basicTests.ts` with the following parameters :
```
  _timePeriod           : 1 day //s imulated period by hardhat)
  _lockedRewardsEnabled : true  // enable reward while tokens are locked - factor is determined by option factor array
  _unlockedRewardsFactor: 0     // no rewards outside lock period
```

## Scenario

- Day 0 :  stake 1000 POLS , lock for 7 days (option 1)
    - verify unlocktime
    - verify that user can not unlock while tokens arelocked

- Day 1
    - check rewards

- Day 7 (end of lock period)
    - check rewards

- Day 8 (1 day after end of lock period)
    - check rewards
    - withdraw half of staked tokens (500 POLS remaining)

- Day 10
    - check rewards (should be 9)
