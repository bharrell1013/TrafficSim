import { Car } from "../models/Car";
import { SpatialHash } from "./SpatialHash";
import type {
  RampConfig,
  RampCar,
  SimulationConfig,
  SimulationMetrics,
  DriverType,
} from "../models/types";

export class Simulation {
  cars: Map<string, Car> = new Map();
  spatialHash: SpatialHash = new SpatialHash();
  config: SimulationConfig;
  ramps: RampConfig[] = [];
  rampCars: RampCar[] = [];
  entranceQueues: Map<number, RampCar[]> = new Map();
  lastMergeTimes: Map<number, number> = new Map();

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
  onStructureChange: (() => void) | null = null;

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
    this.entranceQueues.clear();
    this.ramps = [];
    this.config.numLanes = 3;
    this.onStructureChange?.();

    if (this.onUpdate) {
      this.onUpdate([], this.getMetrics(), []);
    }
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

    // 1. Build Sorted Lane Lists
    // CRITICAL FIX: Cars changing lanes are physically present in BOTH lanes for safety.
    const laneCars = new Map<number, Car[]>();
    for (let i = 0; i < this.config.numLanes; i++) {
      laneCars.set(i, []);
    }
    for (const car of carsArray) {
      // Always in current lane
      laneCars.get(car.state.lane)?.push(car);

      // If changing, also in target lane
      if (car.isChangingLane && car.targetLane !== car.state.lane) {
        laneCars.get(car.targetLane)?.push(car);
      }
    }

    // Sort by position 0->2PI
    for (const [, list] of laneCars) {
      list.sort((a, b) => a.state.position - b.state.position);
    }

    // Reuse SpatialHash ONLY for ramp queries if needed or remove it later.
    // updating it just in case ramp logic still uses it.
    this.spatialHash.update(carsArray);

    for (const car of carsArray) {
      const currentLaneId = car.state.lane;

      // Find leader in sorted list
      // Since we might be in multiple lists (if changing), this logic needs to be robust.
      // We purely want the CLOSEST car ahead in the current context.

      // Helper to find closest car ahead in a specific lane list
      const findLeaderInLane = (
        laneIdx: number,
        myPos: number,
        myId: string
      ): Car | null => {
        const laneList = laneCars.get(laneIdx);
        if (!laneList || laneList.length === 0) return null;

        // Find car with smallest positive diff
        let bestCar: Car | null = null;
        let minDiff = Infinity;

        for (const other of laneList) {
          if (other.state.id === myId) continue;

          let diff = other.state.position - myPos;
          if (diff < 0) diff += Math.PI * 2;

          if (diff < minDiff) {
            minDiff = diff;
            bestCar = other;
          }
        }
        return bestCar;
      };

      let leader = findLeaderInLane(
        currentLaneId,
        car.state.position,
        car.state.id
      );

      // Helper to calculate gap and rate to a specific car
      const getGapAndRate = (target: Car | null, laneIdx: number) => {
        if (!target) return { gap: 1000, rate: 0 };
        const laneRadius =
          this.config.baseRadius + laneIdx * this.config.laneWidth;
        const gap = car.calculateGapTo(
          target,
          laneRadius,
          this.config.carLength
        );
        const rate = car.state.velocity - target.state.velocity;
        return { gap, rate };
      };

      // 1. Current Lane Physics
      const currentLaneRadius =
        this.config.baseRadius + currentLaneId * this.config.laneWidth;

      const currentPhysics = getGapAndRate(leader, currentLaneId);

      // 2. Target Lane Physics (if changing lanes)
      let effectiveGap = currentPhysics.gap;
      let effectiveRate = currentPhysics.rate;

      if (car.isChangingLane) {
        const t = car.laneChangeProgress;
        const targetLaneId = car.targetLane;
        const targetList = laneCars.get(targetLaneId)!;

        // Find leader in target lane
        let targetLeader: Car | null = null;

        let minDiff = Infinity;
        for (const other of targetList) {
          if (other === car) continue;
          let diff = other.state.position - car.state.position;
          if (diff < 0) diff += Math.PI * 2;
          if (diff < minDiff) {
            minDiff = diff;
            targetLeader = other;
          }
        }

        const targetPhysics = getGapAndRate(targetLeader, targetLaneId);

        // Interpolate
        effectiveGap = currentPhysics.gap * (1 - t) + targetPhysics.gap * t;
        effectiveRate = currentPhysics.rate * (1 - t) + targetPhysics.rate * t;

        // Safety Override: purely use target if we are mostly there
        if (t > 0.5) {
          effectiveGap = targetPhysics.gap;
          effectiveRate = targetPhysics.rate;
        }
      }

      car.update(
        dt,
        effectiveGap,
        effectiveRate,
        this.config.speedLimit,
        currentLaneRadius
      );

      // --- RAMP CLEARANCE LOGIC ---
      // If passing an entrance ramp with waiting cars, accelerate to clear the way!
      if (car.state.lane === this.config.numLanes - 1) {
        for (const ramp of this.ramps) {
          if (
            ramp.type === "entrance" &&
            (this.entranceQueues.get(ramp.id)?.length || 0) > 0
          ) {
            let dist = car.state.position - ramp.angle;
            // Normalize dist to [-PI, PI]
            while (dist > Math.PI) dist -= Math.PI * 2;
            while (dist < -Math.PI) dist += Math.PI * 2;

            // If we are within a small window around the ramp (blocking or just passed)
            // Range: From slightly behind (-0.05) to a bit ahead (+0.2)
            // We want to minimize time spent in [-0.05, 0.15]
            if (dist > -0.05 && dist < 0.2) {
              // FORCE ACCELERATION
              // Don't stop!
              if (car.state.velocity < this.config.speedLimit * 1.5) {
                car.state.acceleration = Math.max(car.state.acceleration, 4.0);
              }
            }
          }
        }
      }

      if (!car.isChangingLane) {
        // --- Simplified Driver Logic ---

        let wantToChange = false;
        let preferredDirection: "left" | "right" | null = null;

        // 1. Stuck Logic (Frustration)
        // Aggressive drivers change if slightly stuck. Normal/Slow if really stuck.
        const frustrationThreshold =
          car.state.driverType === "A"
            ? 1.0
            : car.state.driverType === "B"
            ? 3.0
            : 10.0;

        if (car.state.stuckTime > frustrationThreshold) {
          wantToChange = true;
          // Aggressive prefers left (inner), others just want out
          if (car.state.driverType === "A") {
            preferredDirection = "left";
          } else {
            // Pick random valid if desperate
            preferredDirection = Math.random() < 0.5 ? "left" : "right";
          }
        }

        // 2. Goal Seeking (Exit)
        // If we need to exit, force move to right
        if (car.state.targetExit) {
          // Simplification: just try to go right until in lane 0 (outermost)?
          // Actually config.numLanes-1 is outer. 0 is inner?
          // The code implies radius increases with index, so index 0 is inner, numLanes-1 is outer.
          // Wait, earlier logic: baseRadius + lane * width. Lane 0 is smallest radius (inner).
          // Exits are usually on the outside?
          // Let's assume exits are at the edge: lane = numLanes - 1.

          if (car.state.lane < this.config.numLanes - 1) {
            // Need to move right to exit
            // Check distance to exit? simplified: just go right if goal is completed
            if (car.hasReachedGoal()) {
              wantToChange = true;
              preferredDirection = "right";
            }
          }
        }

        // 3. Speed Advantage (Optional "MOBIL-lite")
        // If not stuck but just going slow, improved flow
        // Only aggressive drivers do this proactively without being stuck
        if (car.state.driverType === "A" && !wantToChange) {
          // Check if left lane is faster? Simplified: Randomly check left
          if (Math.random() < 0.02) {
            wantToChange = true;
            preferredDirection = "left";
          }
        }

        if (wantToChange && preferredDirection) {
          // Validate Lane Existence
          let targetLane = -1;
          if (preferredDirection === "left" && currentLaneId > 0)
            targetLane = currentLaneId - 1;
          if (
            preferredDirection === "right" &&
            currentLaneId < this.config.numLanes - 1
          )
            targetLane = currentLaneId + 1;

          // If preferred failed (e.g. want left but at inner edge), try other if desperate
          if (
            targetLane !== -1 &&
            car.state.stuckTime > frustrationThreshold * 2
          ) {
            if (currentLaneId > 0) targetLane = currentLaneId - 1;
            else if (currentLaneId < this.config.numLanes - 1)
              targetLane = currentLaneId + 1;
          }

          if (targetLane !== -1) {
            // Safety Check
            const targetList = laneCars.get(targetLane) || [];
            if (this.isLaneChangeSafe(car, targetLane, targetList)) {
              car.startLaneChange(
                targetLane > currentLaneId ? "right" : "left"
              );
              // Reset stuck time on successful decision to switch
              car.state.stuckTime = 0;
            }
          }
        }

        // --- Cooperative Lane Change (Yield to Entering Traffic) ---
        // If approaching an entrance ramp in the outer lane, and NOT aggressive, try to move left.
        if (
          !car.isChangingLane &&
          car.state.lane === this.config.numLanes - 1 &&
          car.state.driverType !== "A"
        ) {
          for (const ramp of this.ramps) {
            if (ramp.type === "entrance") {
              // Check distance to ramp
              let distToRamp = ramp.angle - car.state.position;
              if (distToRamp < 0) distToRamp += Math.PI * 2;

              // If we are approaching (e.g. within 1/8th of a circle approx ~ 0.8 rads)
              // And there is an inner lane available
              if (
                distToRamp < 0.8 &&
                distToRamp > 0.1 &&
                this.config.numLanes > 1
              ) {
                const targetLane = car.state.lane - 1; // Move Left (Inward)
                const targetList = laneCars.get(targetLane) || [];
                if (this.isLaneChangeSafe(car, targetLane, targetList)) {
                  car.startLaneChange("left");
                  break; // Only need to do this for the first relevant ramp
                }
              }
            }
          }
        }
      }
    }

    this.resolveCollisions(carsArray); // Prevent phasing
    this.assignExitRamps(carsArray);
    this.handleRamps(dt);
    this.processEntranceQueues(dt);
    this.updateRampCars(dt);
    this.pruneExitedCars();
  }

  private assignExitRamps(cars: Car[]): void {
    const exitRamps = this.ramps.filter((r) => r.type === "exit");
    if (exitRamps.length === 0) return;

    for (const car of cars) {
      if (car.state.targetExit === null && car.hasReachedGoal()) {
        car.state.targetExit =
          exitRamps[Math.floor(Math.random() * exitRamps.length)].id;
      }
    }
  }

  private resolveCollisions(cars: Car[]): void {
    // Simple N^2 check (optimized by loop, or spatial hash if needed, but N=100 is fast enough usually)
    // Actually, we can use the Sorted Lane Lists! Collisions only happen in same lane mostly.
    // But during lane change, cross-lane collisions happen.

    const laneMap = new Map<number, Car[]>();
    for (const c of cars) {
      // Add to current lane
      if (!laneMap.has(c.state.lane)) laneMap.set(c.state.lane, []);
      laneMap.get(c.state.lane)!.push(c);

      // If changing, add to target too just in case
      if (c.isChangingLane) {
        if (!laneMap.has(c.targetLane)) laneMap.set(c.targetLane, []);
        laneMap.get(c.targetLane)!.push(c);
      }
    }

    for (const [laneId, laneList] of laneMap) {
      // Sort by position
      laneList.sort((a, b) => a.state.position - b.state.position);

      const laneRadius =
        this.config.baseRadius + laneId * this.config.laneWidth;
      const minSpacing = (this.config.carLength * 1.05) / laneRadius; // 5% buffer angular

      for (let i = 0; i < laneList.length; i++) {
        const c1 = laneList[i];
        const c2 = laneList[(i + 1) % laneList.length]; // Next car (wrap)

        if (c1 === c2) continue;

        // Calculate Gap
        let diff = c2.state.position - c1.state.position;
        if (diff < 0) diff += Math.PI * 2;

        if (diff < minSpacing) {
          // Collision/Overlap Detected!
          const overlap = minSpacing - diff;

          // HYBRID RESOLUTION:
          // 1. If moving fast, use Speed Differential (Braking) to clear overlap.
          // 2. If stopped/slow, use Position Correction (Push) to clear overlap.

          const isMoving = c1.state.velocity > 5 && c2.state.velocity > 5;

          if (isMoving) {
            // DYNAMIC: Force rear car to be slower than front car to open gap
            const targetVel = c2.state.velocity * 0.8; // 80% of leader speed
            if (c1.state.velocity > targetVel) {
              c1.state.velocity = targetVel;
            }
            c1.state.acceleration = -5; // Brake hard
          } else {
            // STATIC: Push apart gently
            c1.state.position -= overlap * 0.1;
            c1.state.velocity = 0;
            c1.state.acceleration = 0;
          }

          c1.state.stuckTime += 0.1;
        }
      }
    }
  }

  private isLaneChangeSafe(
    car: Car,
    targetLaneIdx: number,
    targetList: Car[]
  ): boolean {
    if (targetLaneIdx < 0 || targetLaneIdx >= this.config.numLanes)
      return false;

    const targetRadius =
      this.config.baseRadius + targetLaneIdx * this.config.laneWidth;

    // Strict Interval Overlap Check
    // My interval: [back, front] (handle wrapping?) -> angular
    // Let's us angular distance check for simplicity with wraparound

    const safetyBuffer = (this.config.carLength * 1.5) / targetRadius; // angular buffer

    for (const other of targetList) {
      if (other.state.id === car.state.id) continue;

      let dist = Math.abs(other.state.position - car.state.position);
      if (dist > Math.PI) dist = Math.PI * 2 - dist;

      // Angular size of ONE car
      const carAngularSize = this.config.carLength / targetRadius;

      // If distance < (size + buffer), we overlap
      if (dist < carAngularSize + safetyBuffer) {
        return false;
      }
    }
    return true;
  }

  private handleRamps(dt: number): void {
    for (const ramp of this.ramps) {
      if (ramp.type === "entrance") {
        if (Math.random() < ramp.flowRate * dt) {
          this.addToEntranceQueue(ramp);
        }
      }
    }
  }

  private addToEntranceQueue(ramp: RampConfig): void {
    const types: DriverType[] = Array.from(this.allowedDriverTypes);
    if (types.length === 0) return;

    const driverType = types[Math.floor(Math.random() * types.length)];

    if (!this.entranceQueues.has(ramp.id)) {
      this.entranceQueues.set(ramp.id, []);
    }

    const queue = this.entranceQueues.get(ramp.id)!;
    const maxQueueSize = 5;
    if (queue.length >= maxQueueSize) return;

    const newCar: RampCar = {
      id: `ramp_car_${this.rampCarIdCounter++}`,
      rampId: ramp.id,
      progress: 0,
      driverType,
      entering: true,
      queuePosition: queue.length,
      waitingToMerge: true,
      waitTime: 0,
    };

    queue.push(newCar);
    this.rampCars.push(newCar);
  }

  private processEntranceQueues(dt: number): void {
    for (const [rampId, queue] of this.entranceQueues) {
      if (queue.length === 0) continue;

      const ramp = this.ramps.find((r) => r.id === rampId);
      if (!ramp) continue;

      const frontCar = queue[0];
      if (!frontCar.waitingToMerge) continue;

      // Update wait time for metrics/debug
      frontCar.waitTime += dt;

      const lastMerge = this.lastMergeTimes.get(rampId) || 0;
      const now = performance.now();
      const timeSinceLastMerge = now - lastMerge;

      // Fixed small delay between merges (600ms)
      const MERGE_DELAY_MS = 600;

      if (timeSinceLastMerge < MERGE_DELAY_MS) continue;

      // Strictly check for available space.
      const canMerge = this.checkMergeGap(ramp);

      if (canMerge) {
        // --- IMMEDIATE MERGE ---
        const exitRamps = this.ramps.filter((r) => r.type === "exit");
        const targetExit =
          exitRamps.length > 0
            ? exitRamps[Math.floor(Math.random() * exitRamps.length)].id
            : null;

        const car = new Car(
          ramp.angle,
          ramp.lane,
          this.config.speedLimit * 0.8,
          frontCar.driverType,
          targetExit
        );
        // Trigger post-merge boost
        car.state.lastLaneChangeTime = performance.now();
        this.cars.set(car.state.id, car);

        // Remove from rampCars and Queue immediately
        this.rampCars = this.rampCars.filter((c) => c.id !== frontCar.id);
        queue.shift();

        this.lastMergeTimes.set(ramp.id, now);

        // Update queue positions
        for (let i = 0; i < queue.length; i++) {
          queue[i].queuePosition = i;
        }
      }
    }

    // Animate cars in the queue (visual only)
    for (const rampCar of this.rampCars) {
      if (rampCar.waitingToMerge && rampCar.entering) {
        // Move up to the "stop line" (progress 0.4 approx)
        const targetProgress = 0.4 + rampCar.queuePosition * 0.12;
        if (rampCar.progress < targetProgress) {
          rampCar.progress = Math.min(
            rampCar.progress + dt * 1.0,
            targetProgress
          );
        }
      }
    }
  }

  private checkMergeGap(ramp: RampConfig): boolean {
    const outerLane = this.config.numLanes - 1;
    const outerLaneRadius =
      this.config.baseRadius + outerLane * this.config.laneWidth;

    const carAngularSize = this.config.carLength / outerLaneRadius;

    // We need to check the closest car AHEAD and the closest car BEHIND.
    // CRITICAL CHANGE: Use this.cars directly.
    // spatialHash is stale (pre-update), laneCars is stale coverage.
    // Iterating all cars is O(N) but essential for accuracy here.

    let distAhead = Infinity;
    let distBehind = Infinity;

    for (const car of this.cars.values()) {
      // Filter for outer lane check
      // MUST check if car is IN the lane OR TARGETING the lane (to avoid crashing into lane changers)
      const isRelevant =
        car.state.lane === outerLane ||
        (car.isChangingLane && car.targetLane === outerLane);

      if (!isRelevant) continue;

      // Calculate signed angular difference: car - ramp
      let diff = car.state.position - ramp.angle;

      // Normalize to [-PI, PI]
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      // Optimization: If car is halfway across the map, ignore it
      if (Math.abs(diff) > 1.0) continue;

      // Positive diff -> Car is Ahead
      // Negative diff -> Car is Behind
      if (diff > 0) {
        if (diff < distAhead) distAhead = diff;
      } else {
        // diff is negative, but we want positive distance magnitude
        const d = Math.abs(diff);
        if (d < distBehind) distBehind = d;
      }
    }

    // Safety Thresholds include buffer
    // AHEAD: 3.0 car lengths (Increased to prevent cutting off)
    const reqDistAhead = carAngularSize * 3.0;

    // BEHIND: 4.0 car lengths (Increased to prevent rear-ending)
    const reqDistBehind = carAngularSize * 4.0;

    if (distAhead < reqDistAhead) return false;
    if (distBehind < reqDistBehind) return false;

    return true;
  }

  private updateRampCars(dt: number): void {
    const completedCars: RampCar[] = [];

    for (const rampCar of this.rampCars) {
      if (rampCar.waitingToMerge) continue;

      rampCar.progress += dt * 2;

      if (rampCar.progress >= 1) {
        completedCars.push(rampCar);
      }
    }

    for (const completed of completedCars) {
      if (!completed.entering) {
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
            queuePosition: 0,
            waitingToMerge: false,
            waitTime: 0,
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
    this.onStructureChange?.();
  }

  removeLane(): void {
    if (this.config.numLanes <= 1) return;

    const removedLaneIdx = this.config.numLanes - 1;
    for (const car of this.cars.values()) {
      if (car.state.lane >= removedLaneIdx) {
        this.cars.delete(car.state.id);
      }
    }

    this.config.numLanes--;
    for (const ramp of this.ramps) {
      ramp.lane = this.config.numLanes - 1;
    }
    this.onStructureChange?.();
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
    this.onStructureChange?.();
  }

  removeRamp(id: number): void {
    this.ramps = this.ramps.filter((r) => r.id !== id);
    this.onStructureChange?.();
  }

  setSpeedLimit(limit: number): void {
    this.config.speedLimit = limit;
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

    const waitingCars = Array.from(this.entranceQueues.values()).reduce(
      (sum, q) => sum + q.length,
      0
    );

    return {
      throughput: this.exitedCars.length,
      averageSpeed: avgSpeed,
      density: cars.length,
      totalCars: cars.length,
      waitingCars,
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
    this.onStructureChange?.();
  }
}
