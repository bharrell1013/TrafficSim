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
    const baseGoal = Math.PI * 2 * (1 + Math.random() * 2);

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

  update(dt: number, leadCar: Car | null, speedLimit: number): void {
    let desiredSpeed = speedLimit * this.driver.desiredSpeedMultiplier;

    if (this.state.isYielding) {
      desiredSpeed *= 0.6;
    }

    let gap = 1000;
    let approachingRate = 0;

    if (leadCar) {
      gap = this.calculateGapTo(leadCar);
      approachingRate = this.state.velocity - leadCar.state.velocity;
    }

    this.state.acceleration = calculateIDMAcceleration(
      this.state.velocity,
      desiredSpeed,
      gap,
      approachingRate,
      this.driver
    );

    this.state.acceleration = Math.max(
      -6,
      Math.min(this.state.acceleration, this.driver.maxAcceleration)
    );

    this.state.velocity += this.state.acceleration * dt;
    this.state.velocity = Math.max(0, this.state.velocity);

    const angularVelocity = this.state.velocity / 50;
    const deltaPosition = angularVelocity * dt;
    this.state.position += deltaPosition;
    this.state.distanceTraveled += Math.abs(deltaPosition);

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

  calculateGapTo(other: Car): number {
    let gap = other.state.position - this.state.position;
    if (gap < 0) gap += Math.PI * 2;
    return gap * 50 - 5;
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
