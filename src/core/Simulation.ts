import { Car } from "../models/Car";
import { SpatialHash } from "./SpatialHash";
import type {
  RampConfig,
  RampCar,
  SimulationConfig,
  SimulationMetrics,
  DriverType,
} from "../models/types";
import { shouldChangeLane } from "../physics/MOBIL";

export class Simulation {
  cars: Map<string, Car> = new Map();
  spatialHash: SpatialHash = new SpatialHash();
  config: SimulationConfig;
  ramps: RampConfig[] = [];
  rampCars: RampCar[] = [];

  private running: boolean = false;
  private lastTime: number = 0;
  private accumulator: number = 0;
  private readonly fixedDt: number = 1 / 60;

  private exitedCars: number[] = [];
  private allowedDriverTypes: Set<DriverType> = new Set(["A", "B", "C"]);
  private rampCarIdCounter: number = 0;

  onUpdate:
    | ((cars: Car[], metrics: SimulationMetrics, rampCars: RampCar[]) => void)
    | null = null;

  constructor(config: SimulationConfig) {
    this.config = config;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.loop();
  }

  stop(): void {
    this.running = false;
  }

  reset(): void {
    this.cars.clear();
    this.exitedCars = [];
    this.rampCars = [];
  }

  private loop = (): void => {
    if (!this.running) return;

    const now = performance.now();
    const frameTime = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    this.accumulator += frameTime;

    while (this.accumulator >= this.fixedDt) {
      this.step(this.fixedDt);
      this.accumulator -= this.fixedDt;
    }

    if (this.onUpdate) {
      this.onUpdate(
        Array.from(this.cars.values()),
        this.getMetrics(),
        this.rampCars
      );
    }

    requestAnimationFrame(this.loop);
  };

  step(dt: number): void {
    const carsArray = Array.from(this.cars.values());
    this.spatialHash.update(carsArray);

    for (const car of carsArray) {
      const neighbors = this.spatialHash.getNeighbors(
        car,
        this.config.numLanes
      );

      car.update(dt, neighbors.currentLeader, this.config.speedLimit);

      if (!car.isChangingLane && Math.random() < 0.02) {
        const gaps = {
          current: neighbors.currentLeader
            ? car.calculateGapTo(neighbors.currentLeader)
            : 1000,
          left: neighbors.leftLeader
            ? car.calculateGapTo(neighbors.leftLeader)
            : 1000,
          right: neighbors.rightLeader
            ? car.calculateGapTo(neighbors.rightLeader)
            : 1000,
        };

        const decision = shouldChangeLane(
          car.state,
          car.driver,
          neighbors,
          gaps,
          this.config.speedLimit,
          this.config.numLanes
        );

        if (decision && this.isLaneChangeValid(car, decision)) {
          car.startLaneChange(decision);
        }
      }
    }

    this.handleRamps(dt);
    this.updateRampCars(dt);
    this.pruneExitedCars();
  }

  private isLaneChangeValid(car: Car, direction: "left" | "right"): boolean {
    const newLane =
      direction === "left" ? car.state.lane - 1 : car.state.lane + 1;
    return newLane >= 0 && newLane < this.config.numLanes;
  }

  private handleRamps(dt: number): void {
    for (const ramp of this.ramps) {
      if (ramp.type === "entrance") {
        if (Math.random() < ramp.flowRate * dt) {
          this.startSpawnAnimation(ramp);
        }
      }
    }
  }

  private startSpawnAnimation(ramp: RampConfig): void {
    const types: DriverType[] = Array.from(this.allowedDriverTypes);
    if (types.length === 0) return;

    const driverType = types[Math.floor(Math.random() * types.length)];

    const nearby = this.spatialHash.getNearby(ramp.angle, ramp.lane, 2);
    const hasSpace = nearby.every((car) => {
      let gap = Math.abs(car.state.position - ramp.angle);
      if (gap > Math.PI) gap = Math.PI * 2 - gap;
      return gap > 0.15;
    });

    if (!hasSpace) return;

    this.rampCars.push({
      id: `ramp_car_${this.rampCarIdCounter++}`,
      rampId: ramp.id,
      progress: 0,
      driverType,
      entering: true,
    });
  }

  private updateRampCars(dt: number): void {
    const completedCars: RampCar[] = [];

    for (const rampCar of this.rampCars) {
      rampCar.progress += dt * 2;

      if (rampCar.progress >= 1) {
        completedCars.push(rampCar);
      }
    }

    for (const completed of completedCars) {
      const ramp = this.ramps.find((r) => r.id === completed.rampId);
      if (ramp && completed.entering) {
        const exitRamps = this.ramps.filter((r) => r.type === "exit");
        const targetExit =
          exitRamps.length > 0
            ? exitRamps[Math.floor(Math.random() * exitRamps.length)].id
            : null;

        const car = new Car(
          ramp.angle,
          ramp.lane,
          this.config.speedLimit * 0.8,
          completed.driverType,
          targetExit
        );
        this.cars.set(car.state.id, car);
      } else if (!completed.entering) {
        this.exitedCars.push(Date.now());
      }

      this.rampCars = this.rampCars.filter((c) => c.id !== completed.id);
    }
  }

  private pruneExitedCars(): void {
    const exitRamps = this.ramps.filter((r) => r.type === "exit");

    for (const [id, car] of this.cars) {
      if (car.state.targetExit === null) continue;

      const exitRamp = exitRamps.find((r) => r.id === car.state.targetExit);
      if (!exitRamp) continue;

      if (car.state.lane === this.config.numLanes - 1) {
        let dist = Math.abs(car.state.position - exitRamp.angle);
        if (dist > Math.PI) dist = Math.PI * 2 - dist;

        if (dist < 0.1) {
          this.cars.delete(id);
          this.rampCars.push({
            id: `ramp_car_${this.rampCarIdCounter++}`,
            rampId: exitRamp.id,
            progress: 0,
            driverType: car.state.driverType,
            entering: false,
          });
        }
      }
    }
  }

  setDriverTypes(types: Set<DriverType>): void {
    this.allowedDriverTypes = types;
  }

  setSpawnRate(rate: number): void {
    for (const ramp of this.ramps) {
      if (ramp.type === "entrance") {
        ramp.flowRate = rate;
      }
    }
  }

  addLane(): void {
    this.config.numLanes++;
    for (const ramp of this.ramps) {
      ramp.lane = this.config.numLanes - 1;
    }
  }

  removeLane(): void {
    if (this.config.numLanes <= 1) return;

    for (const car of this.cars.values()) {
      if (car.state.lane >= this.config.numLanes - 1) {
        car.state.lane = this.config.numLanes - 2;
      }
    }

    this.config.numLanes--;
    for (const ramp of this.ramps) {
      ramp.lane = this.config.numLanes - 1;
    }
  }

  addRamp(type: "entrance" | "exit", angle: number): void {
    const id = Math.max(...this.ramps.map((r) => r.id), -1) + 1;
    this.ramps.push({
      id,
      type,
      angle,
      flowRate: type === "entrance" ? 0.5 : 0,
      lane: this.config.numLanes - 1,
    });
  }

  removeRamp(id: number): void {
    this.ramps = this.ramps.filter((r) => r.id !== id);
  }

  getMetrics(): SimulationMetrics {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    this.exitedCars = this.exitedCars.filter((t) => t > oneMinuteAgo);

    const cars = Array.from(this.cars.values());
    const avgSpeed =
      cars.length > 0
        ? cars.reduce((sum, c) => sum + c.state.velocity, 0) / cars.length
        : 0;

    return {
      throughput: this.exitedCars.length,
      averageSpeed: avgSpeed,
      density: cars.length,
      totalCars: cars.length,
    };
  }

  spawnInitialCars(count: number): void {
    for (let i = 0; i < count; i++) {
      const position = (i / count) * Math.PI * 2;
      const lane = Math.floor(Math.random() * this.config.numLanes);
      const types: DriverType[] = Array.from(this.allowedDriverTypes);
      const driverType = types[Math.floor(Math.random() * types.length)] || "A";

      const car = new Car(
        position,
        lane,
        this.config.speedLimit * 0.9,
        driverType,
        null
      );
      this.cars.set(car.state.id, car);
    }
  }
}
