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
    };
    this.driver = { ...DRIVER_PROFILES[driverType] };
    this.targetLane = lane;
  }

  update(
    dt: number,
    leadCar: Car | null,
    speedLimit: number,
    radius: number,
    carLength: number
  ): void {
    let desiredSpeed = speedLimit * this.driver.desiredSpeedMultiplier;

    if (this.state.isYielding) {
      desiredSpeed *= 0.6;
    }

    let gap = 1000;
    let approachingRate = 0;

    if (leadCar) {
      gap = this.calculateGapTo(leadCar, radius, carLength);
      approachingRate = this.state.velocity - leadCar.state.velocity;
    }

    this.state.acceleration = calculateIDMAcceleration(
      this.state.velocity,
      desiredSpeed,
      gap,
      approachingRate,
      this.driver
    );

    // Emergency braking if very close
    if (gap < 5) {
      this.state.acceleration = Math.min(-15, this.state.acceleration);
    } else {
      this.state.acceleration = Math.max(
        -8,
        Math.min(this.state.acceleration, this.driver.maxAcceleration)
      );
    }

    this.state.velocity += this.state.acceleration * dt;
    this.state.velocity = Math.max(0, this.state.velocity);

    const angularVelocity = this.state.velocity / radius;
    const deltaPosition = angularVelocity * dt;
    this.state.position += deltaPosition;
    this.state.distanceTraveled += Math.abs(deltaPosition * radius); // Linear distance

    if (this.state.position >= Math.PI * 2) {
      this.state.position -= Math.PI * 2;
      this.state.lapsCompleted++;
    }

    if (this.isChangingLane) {
      this.laneChangeProgress += dt * 1.5;
      if (this.laneChangeProgress >= 1) {
        this.state.lane = this.targetLane;
        this.isChangingLane = false;
        this.laneChangeProgress = 0;
      }
    }
  }

  calculateGapTo(other: Car, radius: number, carLength: number): number {
    let deltaAngle = other.state.position - this.state.position;
    if (deltaAngle < 0) deltaAngle += Math.PI * 2;

    // Convert angular gap to linear distance
    const linearDist = deltaAngle * radius;

    // Subtract car length to get bumper-to-bumper gap
    return Math.max(0, linearDist - carLength);
  }

  startLaneChange(direction: "left" | "right"): void {
    if (this.isChangingLane) return;

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
