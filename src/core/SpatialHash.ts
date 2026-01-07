import { Car } from "../models/Car";

const BUCKET_COUNT = 36;
const BUCKET_SIZE = (Math.PI * 2) / BUCKET_COUNT;

export class SpatialHash {
  private buckets: Map<string, Car[]> = new Map();

  update(cars: Car[]): void {
    this.buckets.clear();

    for (const car of cars) {
      const key = this.getKey(car.state.position, car.state.lane);
      if (!this.buckets.has(key)) {
        this.buckets.set(key, []);
      }
      this.buckets.get(key)!.push(car);
    }
  }

  private getKey(position: number, lane: number): string {
    const bucket = Math.floor(position / BUCKET_SIZE) % BUCKET_COUNT;
    return `${bucket}_${lane}`;
  }

  private getBucketIndex(position: number): number {
    return Math.floor(position / BUCKET_SIZE) % BUCKET_COUNT;
  }

  getNearby(position: number, lane: number, range: number = 2): Car[] {
    const cars: Car[] = [];
    const centerBucket = this.getBucketIndex(position);

    for (let offset = -range; offset <= range; offset++) {
      const bucket = (centerBucket + offset + BUCKET_COUNT) % BUCKET_COUNT;
      const key = `${bucket}_${lane}`;
      const bucketed = this.buckets.get(key);
      if (bucketed) {
        cars.push(...bucketed);
      }
    }

    return cars;
  }

  getNeighbors(
    car: Car,
    numLanes: number
  ): {
    currentLeader: Car | null;
    currentFollower: Car | null;
    leftLeader: Car | null;
    leftFollower: Car | null;
    rightLeader: Car | null;
    rightFollower: Car | null;
  } {
    const pos = car.state.position;
    const lane = car.state.lane;

    const currentLane = this.getNearby(pos, lane, 3);
    const leftLane = lane > 0 ? this.getNearby(pos, lane - 1, 3) : [];
    const rightLane =
      lane < numLanes - 1 ? this.getNearby(pos, lane + 1, 3) : [];

    return {
      currentLeader: this.findLeader(car, currentLane),
      currentFollower: this.findFollower(car, currentLane),
      leftLeader: this.findLeader(car, leftLane),
      leftFollower: this.findFollower(car, leftLane),
      rightLeader: this.findLeader(car, rightLane),
      rightFollower: this.findFollower(car, rightLane),
    };
  }

  private findLeader(car: Car, candidates: Car[]): Car | null {
    let leader: Car | null = null;
    let minGap = Infinity;

    for (const candidate of candidates) {
      if (candidate.state.id === car.state.id) continue;

      let gap = candidate.state.position - car.state.position;
      if (gap < 0) gap += Math.PI * 2;
      if (gap < 0.01) gap += Math.PI * 2;

      if (gap < minGap) {
        minGap = gap;
        leader = candidate;
      }
    }

    return leader;
  }

  private findFollower(car: Car, candidates: Car[]): Car | null {
    let follower: Car | null = null;
    let minGap = Infinity;

    for (const candidate of candidates) {
      if (candidate.state.id === car.state.id) continue;

      let gap = car.state.position - candidate.state.position;
      if (gap < 0) gap += Math.PI * 2;
      if (gap < 0.01) gap += Math.PI * 2;

      if (gap < minGap) {
        minGap = gap;
        follower = candidate;
      }
    }

    return follower;
  }
}
