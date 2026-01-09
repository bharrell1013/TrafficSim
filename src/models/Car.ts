import type { CarState, DriverProfile, DriverType } from "./types";
import { DRIVER_PROFILES } from "./types";
import { calculateIDMAcceleration } from "../physics/IDM";

let carIdCounter = 0;

export class Car {
  state: CarState;
  driver: DriverProfile;
  isChangingLane: boolean = false;
  laneChangeProgress: number = 0;
  targetLane: number = 0;
  laneChangeDirection: "left" | "right" | null = null;

  isDistracted: boolean = false;
  distractionIntensity: number = 0;
  private distractionTimer: number = 0;
  private nextDistractionTime: number = 0;

  constructor(
    position: number,
    lane: number,
    velocity: number,
    driverType: DriverType,
    targetExit: number | null = null
  ) {
    const goalMultipliers: Record<DriverType, number> = {
      A: 1.0,
      B: 0.5,
      C: 1.5,
    };
    // Base goal in laps (Reduced)
    const minLaps = 0.5 + Math.random() * 1.5;
    // Approximate average circumference (Radius ~185 * 2 * PI) ~ 1160 pixels
    const approxCircumference = 1160;

    const baseGoal = approxCircumference * minLaps;

    this.state = {
      id: `car_${carIdCounter++}`,
      position,
      lane,
      velocity,
      acceleration: 0,
      targetExit,
      lapsCompleted: 0,
      driverType,
      isYielding: false,
      yieldTarget: null,
      minTravelDistance: baseGoal * goalMultipliers[driverType],
      distanceTraveled: 0,
      stuckTime: 0,
      lastLaneChangeTime: -1000,
    };
    this.driver = { ...DRIVER_PROFILES[driverType] };
    this.targetLane = lane;
  }

  update(
    dt: number,
    currentGap: number,
    approachingRate: number,
    speedLimit: number,
    radius: number
  ): void {
    let desiredSpeed = speedLimit * this.driver.desiredSpeedMultiplier;

    const timeSinceSpawn = performance.now() - this.state.lastLaneChangeTime;
    const isInRampGracePeriod = timeSinceSpawn < 3000;

    // Type B (Aggressive): Push for higher speed whenever possible
    if (this.state.driverType === "B") {
      if (currentGap > 50) desiredSpeed *= 1.15;
    }

    // Type C (Phone Checker + Sunday Driver): Distraction and erratic behavior
    // But NOT during ramp grace period - let them accelerate first
    if (this.state.driverType === "C" && !isInRampGracePeriod) {
      this.updateDistraction(dt);

      if (this.isDistracted) {
        const oscillation = Math.sin(performance.now() * 0.005) * 0.3;
        desiredSpeed *= 0.7 + oscillation;

        if (Math.random() < 0.02) {
          this.state.acceleration = -this.driver.comfortableBraking * 0.8;
        }
      }
    } else if (this.state.driverType === "C" && isInRampGracePeriod) {
      desiredSpeed = speedLimit;
    }

    // Update Stuck Time
    if (this.state.velocity < desiredSpeed * 0.6 && currentGap < 50) {
      this.state.stuckTime += dt;
    } else {
      this.state.stuckTime = Math.max(0, this.state.stuckTime - dt * 2);
    }

    // IDM Calculation
    let gap = currentGap;

    let perceivedGap = gap;
    if (this.state.driverType === "A") perceivedGap *= 1.2;

    this.state.acceleration = calculateIDMAcceleration(
      this.state.velocity,
      desiredSpeed,
      perceivedGap,
      approachingRate,
      this.driver
    );

    // --- GAP FILLER LOGIC ---
    const gapThreshold = speedLimit * 0.5;
    if (gap > gapThreshold && this.state.velocity < desiredSpeed * 0.98) {
      let boost = 0.8;
      if (this.state.driverType === "B") boost = 2.0;
      else if (this.state.driverType === "C" && this.isDistracted) boost = 0.3;

      this.state.acceleration = Math.max(
        this.state.acceleration,
        this.driver.maxAcceleration * boost
      );

      const timeSinceChange = performance.now() - this.state.lastLaneChangeTime;
      if (timeSinceChange < 3000) {
        if (gap > speedLimit * 0.8) {
          const turboBoost = this.state.driverType === "B" ? 4.0 : 3.0;
          this.state.acceleration = Math.max(
            this.state.acceleration,
            this.driver.maxAcceleration * turboBoost
          );
        }
      }
    }

    // Hard clamps for collision avoidance
    if (gap < 3) {
      this.state.acceleration = -this.driver.maxAcceleration * 1.5;
      this.state.velocity = Math.max(0, this.state.velocity - 2 * dt);
    } else if (gap < 10) {
      this.state.acceleration = Math.min(this.state.acceleration, -1);
    }

    // --- RAMP MERGE ACCELERATION OVERRIDE ---
    // Applied AFTER all other calculations to guarantee acceleration for newly merged cars
    if (
      isInRampGracePeriod &&
      this.state.velocity < speedLimit * 0.95 &&
      gap > 15
    ) {
      const minMergeAcceleration = Math.max(2.0, speedLimit * 0.025);
      this.state.acceleration = Math.max(
        this.state.acceleration,
        minMergeAcceleration
      );
    }

    // Acceleration smoothing
    this.state.velocity += this.state.acceleration * dt;
    this.state.velocity = Math.max(0, this.state.velocity);

    const angularVelocity = this.state.velocity / radius;
    const deltaPosition = angularVelocity * dt;
    this.state.position += deltaPosition;
    this.state.distanceTraveled += Math.abs(deltaPosition * radius);

    if (this.state.position >= Math.PI * 2) {
      this.state.position -= Math.PI * 2;
      this.state.lapsCompleted++;
    } else if (this.state.position < 0) {
      this.state.position += Math.PI * 2;
      this.state.lapsCompleted--; // Technically un-lapping?
    }

    if (this.isChangingLane) {
      let changeSpeed = 1.5;
      if (this.state.driverType === "B") changeSpeed = 4.0;
      else if (this.state.driverType === "C") changeSpeed = 0.8;

      this.laneChangeProgress += dt * changeSpeed;

      if (this.laneChangeProgress >= 1) {
        this.state.lane = this.targetLane;
        this.isChangingLane = false;
        this.laneChangeProgress = 0;
        this.laneChangeDirection = null;
        this.state.lastLaneChangeTime = performance.now();
        this.state.stuckTime = 0;
      }
    }
  }

  calculateGapTo(other: Car, radius: number, carLength: number): number {
    let deltaAngle = other.state.position - this.state.position;
    if (deltaAngle < 0) deltaAngle += Math.PI * 2;
    const linearDist = deltaAngle * radius;
    return Math.max(0, linearDist - carLength);
  }

  startLaneChange(direction: "left" | "right"): void {
    if (this.isChangingLane) return;

    const now = performance.now();
    const cooldown = this.state.driverType === "B" ? 800 : 2000;
    if (now - this.state.lastLaneChangeTime < cooldown) return;

    this.isChangingLane = true;
    this.laneChangeProgress = 0;
    this.laneChangeDirection = direction;
    this.targetLane =
      direction === "left" ? this.state.lane - 1 : this.state.lane + 1;
  }

  getCurrentLane(): number {
    if (!this.isChangingLane) return this.state.lane;
    const t = this.laneChangeProgress;
    return this.state.lane + (this.targetLane - this.state.lane) * t;
  }

  getSpeedRatio(speedLimit: number): number {
    return Math.min(1, this.state.velocity / speedLimit);
  }

  private updateDistraction(dt: number): void {
    this.distractionTimer += dt;

    if (!this.isDistracted) {
      if (this.distractionTimer >= this.nextDistractionTime) {
        this.isDistracted = true;
        this.distractionIntensity = 0.5 + Math.random() * 0.5;
        this.distractionTimer = 0;
        this.nextDistractionTime = 1 + Math.random() * 1;
      }
    } else {
      if (this.distractionTimer >= this.nextDistractionTime) {
        this.isDistracted = false;
        this.distractionIntensity = 0;
        this.distractionTimer = 0;
        this.nextDistractionTime = 6 + Math.random() * 6;
      }
    }
  }

  hasReachedGoal(): boolean {
    return this.state.distanceTraveled >= this.state.minTravelDistance;
  }

  isDesperate(): boolean {
    return this.state.distanceTraveled >= this.state.minTravelDistance * 2;
  }
}
