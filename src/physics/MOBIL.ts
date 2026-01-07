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
  direction: "left" | "right",
  radius: number,
  carLength: number,
  densityIncentive: number = 0
): LaneChangeResult {
  const desiredSpeed = speedLimit * driver.desiredSpeedMultiplier;
  const safeDecelThreshold = -4;

  const currentAcc = currentLeader
    ? calculateIDMAcceleration(
        car.velocity,
        desiredSpeed,
        currentLaneGap, // Already linear
        car.velocity - currentLeader.state.velocity,
        driver
      )
    : calculateIDMAcceleration(car.velocity, desiredSpeed, 1000, 0, driver);

  const newAcc = targetLeader
    ? calculateIDMAcceleration(
        car.velocity,
        desiredSpeed,
        targetLaneGap, // Already linear
        car.velocity - targetLeader.state.velocity,
        driver
      )
    : calculateIDMAcceleration(car.velocity, desiredSpeed, 1000, 0, driver);

  let followerNewAcc = 0;
  if (targetFollower) {
    const gapToNewFollower = calculateGap(
      targetFollower.state.position,
      car.position,
      radius,
      carLength
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
  const incentive = accGain - politenessLoss + densityIncentive;

  const threshold = 0.1;

  return {
    direction: safetyOk && incentive > threshold ? direction : null,
    safetyOk,
    incentive,
  };
}

function calculateGap(
  followerPos: number,
  leaderPos: number,
  radius: number,
  carLength: number
): number {
  let deltaAngle = leaderPos - followerPos;
  if (deltaAngle < 0) deltaAngle += Math.PI * 2;

  const linearDist = deltaAngle * radius;
  return Math.max(0, linearDist - carLength);
}

function hasAdjacentCar(
  car: CarState,
  adjacent: Car | null,
  linkRadius: number,
  carLength: number
): boolean {
  if (!adjacent) return false;
  let gapAngle = Math.abs(adjacent.state.position - car.position);
  if (gapAngle > Math.PI) gapAngle = Math.PI * 2 - gapAngle;

  const linearGap = gapAngle * linkRadius;
  // Safety buffer of 50% car length
  return linearGap < carLength * 1.5;
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
  radius: number,
  carLength: number,
  laneDensities: number[],
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

  const minFollowerGap = carLength * 1.5;
  const needsToExit = car.targetExit !== null && hasReachedGoal;
  const isInOuterLane = car.lane === numLanes - 1;
  const isInInnerLane = car.lane === 0;

  // Density Incentive Calculation
  // We want to encourage moving to lanes with fewer cars.
  // Normalize density by lane count? Or just raw count difference.
  // Raw difference is simplest.
  // Tuning: 1 car difference -> small incentive. 5 cars -> large.
  // Let's say adding 0.2 per car difference.

  const getDensityIncentive = (targetLaneIdx: number) => {
    if (targetLaneIdx < 0 || targetLaneIdx >= numLanes) return -999;
    const currentDensity = laneDensities[car.lane] || 0;
    const targetDensity = laneDensities[targetLaneIdx] || 0;
    // Positive if target has fewer cars
    // We only care about relative density
    const diff = currentDensity - targetDensity;
    return diff * 0.3; // Factor
  };

  if (needsToExit && !isInOuterLane) {
    if (hasAdjacentCar(car, rightAdjacent, radius, carLength)) return null;

    if (rightFollower) {
      if (
        calculateGap(
          rightFollower.state.position,
          car.position,
          radius,
          carLength
        ) < minFollowerGap
      )
        return null;
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
      "right",
      radius,
      carLength,
      getDensityIncentive(car.lane + 1)
    );
    if (rightResult.safetyOk) return "right";
    return null;
  }

  if (!isInInnerLane && !needsToExit) {
    if (hasAdjacentCar(car, leftAdjacent, radius, carLength)) {
      // blocked
    } else {
      let followerSafe = true;
      if (leftFollower) {
        if (
          calculateGap(
            leftFollower.state.position,
            car.position,
            radius,
            carLength
          ) < minFollowerGap
        ) {
          followerSafe = false;
        }
      }

      if (followerSafe) {
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
          "left",
          radius,
          carLength,
          getDensityIncentive(car.lane - 1)
        );
        if (leftResult.direction) return "left";

        if (gaps.left > gaps.current * 1.3) return "left";
      }
    }
  }

  if (!isInOuterLane && !needsToExit && currentLeader) {
    const currentGap = gaps.current;
    if (currentGap < carLength * 3 && gaps.right > currentGap * 1.5) {
      if (!hasAdjacentCar(car, rightAdjacent, radius, carLength)) {
        let followerSafe = true;
        if (rightFollower) {
          if (
            calculateGap(
              rightFollower.state.position,
              car.position,
              radius,
              carLength
            ) < minFollowerGap
          ) {
            followerSafe = false;
          }
        }

        if (followerSafe) {
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
            "right",
            radius,
            carLength,
            getDensityIncentive(car.lane + 1)
          );
          if (rightResult.direction) return "right";
        }
      }
    }
  }

  return null;
}
