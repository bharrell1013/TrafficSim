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

function hasAdjacentCar(
  car: CarState,
  adjacent: Car | null,
  safeGapThreshold: number
): boolean {
  if (!adjacent) return false;
  let gap = Math.abs(adjacent.state.position - car.position);
  if (gap > Math.PI) gap = Math.PI * 2 - gap;
  return gap < safeGapThreshold;
}

export function shouldChangeLane(
  car: CarState,
  driver: DriverProfile,
  neighbors: {
    currentLeader: Car | null;
    currentFollower: Car | null;
    leftLeader: Car | null;
    leftFollower: Car | null;
    leftAdjacent: Car | null;
    rightLeader: Car | null;
    rightFollower: Car | null;
    rightAdjacent: Car | null;
  },
  gaps: {
    current: number;
    left: number;
    right: number;
  },
  speedLimit: number,
  numLanes: number,
  hasReachedGoal: boolean = false
): "left" | "right" | null {
  const {
    currentLeader,
    currentFollower,
    leftLeader,
    leftFollower,
    leftAdjacent,
    rightLeader,
    rightFollower,
    rightAdjacent,
  } = neighbors;

  const safeGapThreshold = 0.15;
  const minFollowerGap = 8;

  const needsToExit = car.targetExit !== null && hasReachedGoal;
  const isInOuterLane = car.lane === numLanes - 1;
  const isInInnerLane = car.lane === 0;

  if (needsToExit && !isInOuterLane) {
    if (hasAdjacentCar(car, rightAdjacent, safeGapThreshold)) return null;

    if (rightFollower) {
      let followerGap = car.position - rightFollower.state.position;
      if (followerGap < 0) followerGap += Math.PI * 2;
      if (followerGap * 50 < minFollowerGap) return null;
    }

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
    return null;
  }

  if (!isInInnerLane && !needsToExit) {
    if (hasAdjacentCar(car, leftAdjacent, safeGapThreshold)) {
    } else {
      if (leftFollower) {
        let followerGap = car.position - leftFollower.state.position;
        if (followerGap < 0) followerGap += Math.PI * 2;
        if (followerGap * 50 >= minFollowerGap) {
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

          if (gaps.left > gaps.current * 1.3) {
            return "left";
          }
        }
      } else {
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

        if (gaps.left > gaps.current * 1.2) {
          return "left";
        }
      }
    }
  }

  if (!isInOuterLane && !needsToExit && currentLeader) {
    const currentGap = gaps.current;
    if (currentGap < 20 && gaps.right > currentGap * 1.5) {
      if (!hasAdjacentCar(car, rightAdjacent, safeGapThreshold)) {
        if (rightFollower) {
          let followerGap = car.position - rightFollower.state.position;
          if (followerGap < 0) followerGap += Math.PI * 2;
          if (followerGap * 50 >= minFollowerGap) {
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
        } else {
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
      }
    }
  }

  return null;
}
