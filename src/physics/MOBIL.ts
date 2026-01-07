import type { DriverProfile, CarState } from "../models/types";
import type { Car } from "../models/Car";
import { calculateIDMAcceleration } from "./IDM";

export interface LaneChangeResult {
  direction: "left" | "right" | null;
  safetyOk: boolean;
  incentive: number;
}

export function evaluateLaneChange(
  car: CarState,
  driver: DriverProfile,
  currentLeader: Car | null,
  _currentFollower: Car | null,
  targetLeader: Car | null,
  targetFollower: Car | null,
  currentLaneGap: number,
  targetLaneGap: number,
  speedLimit: number,
  direction: "left" | "right"
): LaneChangeResult {
  const desiredSpeed = speedLimit * driver.desiredSpeedMultiplier;
  const safeDecelThreshold = -4;

  const currentAcc = currentLeader
    ? calculateIDMAcceleration(
        car.velocity,
        desiredSpeed,
        currentLaneGap,
        car.velocity - currentLeader.state.velocity,
        driver
      )
    : calculateIDMAcceleration(car.velocity, desiredSpeed, 1000, 0, driver);

  const newAcc = targetLeader
    ? calculateIDMAcceleration(
        car.velocity,
        desiredSpeed,
        targetLaneGap,
        car.velocity - targetLeader.state.velocity,
        driver
      )
    : calculateIDMAcceleration(car.velocity, desiredSpeed, 1000, 0, driver);

  let followerNewAcc = 0;
  if (targetFollower) {
    const gapToNewFollower = calculateGap(
      targetFollower.state.position,
      car.position
    );
    followerNewAcc = calculateIDMAcceleration(
      targetFollower.state.velocity,
      desiredSpeed,
      gapToNewFollower,
      targetFollower.state.velocity - car.velocity,
      driver
    );
  }

  const safetyOk = followerNewAcc > safeDecelThreshold * driver.gapAcceptance;

  const accGain = newAcc - currentAcc;
  const politenessLoss = driver.politeness * Math.abs(followerNewAcc);
  const incentive = accGain - politenessLoss;

  const threshold = 0.1;

  return {
    direction: safetyOk && incentive > threshold ? direction : null,
    safetyOk,
    incentive,
  };
}

function calculateGap(followerPos: number, leaderPos: number): number {
  let gap = leaderPos - followerPos;
  if (gap < 0) gap += Math.PI * 2;
  return gap * 50;
}

export function shouldChangeLane(
  car: CarState,
  driver: DriverProfile,
  neighbors: {
    currentLeader: Car | null;
    currentFollower: Car | null;
    leftLeader: Car | null;
    leftFollower: Car | null;
    rightLeader: Car | null;
    rightFollower: Car | null;
  },
  gaps: {
    current: number;
    left: number;
    right: number;
  },
  speedLimit: number,
  numLanes: number
): "left" | "right" | null {
  const {
    currentLeader,
    currentFollower,
    leftLeader,
    leftFollower,
    rightLeader,
    rightFollower,
  } = neighbors;

  const needsToExit = car.targetExit !== null;
  const isInOuterLane = car.lane === numLanes - 1;

  if (needsToExit && !isInOuterLane) {
    const rightResult = evaluateLaneChange(
      car,
      driver,
      currentLeader,
      currentFollower,
      rightLeader,
      rightFollower,
      gaps.current,
      gaps.right,
      speedLimit,
      "right"
    );
    if (rightResult.safetyOk) return "right";
  }

  if (car.lane > 0) {
    const leftResult = evaluateLaneChange(
      car,
      driver,
      currentLeader,
      currentFollower,
      leftLeader,
      leftFollower,
      gaps.current,
      gaps.left,
      speedLimit,
      "left"
    );
    if (leftResult.direction) return "left";
  }

  if (car.lane < numLanes - 1 && !needsToExit) {
    const rightResult = evaluateLaneChange(
      car,
      driver,
      currentLeader,
      currentFollower,
      rightLeader,
      rightFollower,
      gaps.current,
      gaps.right,
      speedLimit,
      "right"
    );
    if (rightResult.direction) return "right";
  }

  return null;
}
