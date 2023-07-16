import { ethers, network } from "hardhat";
import { abort } from "process";
import * as readline from "readline";

const PERIOD_HARDHAT = 24 * 60 * 60; // 1 day (simulated time periods) on hardhat
const PERIOD_BLOCKCHAIN = 60; // 1 minutes on "real" blockchains

/**
 * @note return a appropriate timePeriod depending on blockchain used
 * @returns timePeriod (interval) used for testing in seconds
 */
export function timePeriod(): number {
  return network.name == "hardhat" ? PERIOD_HARDHAT : PERIOD_BLOCKCHAIN;
}

export const consoleLog_timestamp = async (t0: number) => {
  const currentTime = await getTimestamp();
  console.log("currentTime =", currentTime, "period =", (currentTime - t0) / timePeriod());
};


// console.log a string and a time in human readable format converted to days
export function logStringTime(text: string, t: number) {
  console.log(text, (t / timePeriod()).toFixed(3));
};


/**
 * @dev helper function to get block.timestamp from hardhat provider
 * @returns block.timestamp in unix epoch time (seconds)
 */
const blockTimestamp = async (): Promise<number> => {
  const blockNumber = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNumber);
  if (block === null) {
    return 0
  } else {
    return block.timestamp;
  }
};

export const getTimestamp = async (): Promise<number> => {
  let currentTime: number;
  if (network.name == "hardhat") {
    currentTime = await blockTimestamp();
  } else {
    currentTime = Math.floor(Date.now() / 1000);
  }
  return currentTime;
};

/**
 * @dev helper function for hardhat local blockchain to move time
 * @param timeAmount in seconds blockchain time should move forward
 */
export const moveTime = async (timeAmount: number): Promise<number> => {
  console.log("Jumping ", timeAmount, "seconds into the future ...");
  await ethers.provider.send("evm_increaseTime", [timeAmount]);
  await ethers.provider.send("evm_mine", []);
  const blockNumber = await ethers.provider.getBlockNumber();
  const timeNow = await blockTimestamp();
  console.log("moveTime : timeNow =", timeNow);
  console.log("----------------------------------------------------------------------------");
  return timeNow;
};

/**
 * @dev move time forward on hardhat
 * @dev wait if on a "real" blockchain
 * @param waitSeconds in seconds blockchain time should move forward
 */
export const waitTime = async (waitSeconds: number): Promise<number> => {
  if (waitSeconds < 0) {
    console.log("ERROR : waitTime is negative", waitSeconds);
    abort;
  }

  let newTime: number;
  if (network.name == "hardhat") {
    newTime = await moveTime(waitSeconds);
  } else {
    for (let s = waitSeconds; s > 0; s--) {
      // console.log(s, "seconds to wait     \r");
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(s + " seconds to wait     ");
      await new Promise(f => setTimeout(f, 1000));
    }
    // process.stdout.write("\n");
    readline.cursorTo(process.stdout, 0);
    newTime = Math.floor(Date.now() / 1000);
  }
  return newTime;
};

/**
 * @dev to move time to an absolute time in the future
 * @param time in unix epoch seconds
 */
export const setTime = async (time: number): Promise<number> => {
  console.log("----------------------------------------------------------------------------");
  console.log("setTime : Jumping to unix time :", time);

  if (network.name == "hardhat") {
    await ethers.provider.send("evm_setNextBlockTimestamp", [time]);
    await ethers.provider.send("evm_mine", []);
  } else {
    const now = await getTimestamp();
    await waitTime(time - now);
  }

  const timeNow = await getTimestamp();
  console.log("----------------------------------------------------------------------------");
  return timeNow;
};
