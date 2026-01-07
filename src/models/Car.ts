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
    // Base goal in laps (1 to 3 laps)
    const minLaps = 1 + Math.random() * 2;
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

    // Adjust desired speed based on DriverType quirks
    if (this.state.driverType === "A") {
      // Aggressive drivers want to go faster if open road
      if (currentGap > 100) desiredSpeed *= 1.1;
    } else if (this.state.driverType === "C") {
      // Slow drivers fluctuate
      desiredSpeed *= 0.9 + Math.random() * 0.2;
    }

    if (this.state.isYielding) {
      desiredSpeed *= 0.5;
    }

    // Update Stuck Time
    if (this.state.velocity < desiredSpeed * 0.6 && currentGap < 50) {
      this.state.stuckTime += dt;
    } else {
      this.state.stuckTime = Math.max(0, this.state.stuckTime - dt * 2);
    }

    // IDM Calculation
    let gap = currentGap;

    // Tuning IDM for "Arcade" feel but keeping physics
    // We artificially mask the gap for aggressive drivers to make them tailgait more
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
    // If there is a lot of space, accelerate hard!
    // IDM is sometimes too polite.
    if (gap > 80 && this.state.velocity < desiredSpeed * 0.95) {
      // Boost acceleration
      const boost = this.state.driverType === "A" ? 1.0 : 0.5;
      this.state.acceleration = Math.max(
        this.state.acceleration,
        this.driver.maxAcceleration * boost
      );
    }

    // Hard clamps for collision avoidance (The "Don't Hit Stuff" rule)
    if (gap < 5) {
      this.state.acceleration = -this.driver.maxAcceleration * 2; // Emergency brake
      this.state.velocity = 0; // Force stop if literally touching
    } else if (gap < 15) {
      this.state.acceleration = Math.min(this.state.acceleration, -2); // Strong braking
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
    }

    if (this.isChangingLane) {
      // Aggressive drivers change lanes faster
      const changeSpeed = this.state.driverType === "A" ? 2.5 : 1.5;
      this.laneChangeProgress += dt * changeSpeed;

      if (this.laneChangeProgress >= 1) {
        this.state.lane = this.targetLane;
        this.isChangingLane = false;
        this.laneChangeProgress = 0;
        this.state.lastLaneChangeTime = performance.now();
        this.state.stuckTime = 0; // Reset frustration
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

    // Cooldown check (prevent rapid switching)
    const now = performance.now();
    if (now - this.state.lastLaneChangeTime < 2000) return; // 2s cooldown

    this.isChangingLane = true;
    this.laneChangeProgress = 0;
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

  hasReachedGoal(): boolean {
    return this.state.distanceTraveled >= this.state.minTravelDistance;
  }
}
