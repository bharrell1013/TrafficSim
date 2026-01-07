export interface Position {
  x: number;
  y: number;
}

export interface CarState {
  id: string;
  position: number;
  lane: number;
  velocity: number;
  acceleration: number;
  targetExit: number | null;
  lapsCompleted: number;
  driverType: DriverType;
  isYielding: boolean;
  yieldTarget: number | null;
  minTravelDistance: number;
  distanceTraveled: number;
  stuckTime: number;
  lastLaneChangeTime: number;
}

export type DriverType = "A" | "B" | "C";

export interface DriverProfile {
  type: DriverType;
  desiredSpeedMultiplier: number;
  minTimeGap: number;
  maxAcceleration: number;
  comfortableBraking: number;
  politeness: number;
  gapAcceptance: number;
  yieldProbability: number;
}

export interface LaneConfig {
  index: number;
  radius: number;
}

export interface RampConfig {
  id: number;
  type: "entrance" | "exit";
  angle: number;
  flowRate: number;
  lane: number;
  lastSpawnTime?: number;
}

export interface RampCar {
  id: string;
  rampId: number;
  progress: number;
  driverType: DriverType;
  entering: boolean;
  queuePosition: number;
  waitingToMerge: boolean;
  waitTime: number;
}

export interface SimulationConfig {
  speedLimit: number;
  numLanes: number;
  baseRadius: number;
  laneWidth: number;
  carLength: number;
  carWidth: number;
}

export interface SimulationMetrics {
  throughput: number;
  averageSpeed: number;
  density: number;
  totalCars: number;
}

export const DRIVER_PROFILES: Record<DriverType, DriverProfile> = {
  A: {
    type: "A",
    desiredSpeedMultiplier: 1.0,
    minTimeGap: 1.5,
    maxAcceleration: 1.4,
    comfortableBraking: 2.0,
    politeness: 0.5,
    gapAcceptance: 1.0,
    yieldProbability: 0.7,
  },
  B: {
    type: "B",
    desiredSpeedMultiplier: 1.2,
    minTimeGap: 0.8,
    maxAcceleration: 2.0,
    comfortableBraking: 3.0,
    politeness: -0.2,
    gapAcceptance: 0.5,
    yieldProbability: 0,
  },
  C: {
    type: "C",
    desiredSpeedMultiplier: 0.8,
    minTimeGap: 2.5,
    maxAcceleration: 0.8,
    comfortableBraking: 1.5,
    politeness: 0.8,
    gapAcceptance: 2.0,
    yieldProbability: 0.4,
  },
};
