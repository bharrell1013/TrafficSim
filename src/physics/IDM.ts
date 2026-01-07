import type { DriverProfile } from "../models/types";

export function calculateIDMAcceleration(
  currentSpeed: number,
  desiredSpeed: number,
  gap: number,
  approachingRate: number,
  profile: DriverProfile
): number {
  const { maxAcceleration: a, comfortableBraking: b, minTimeGap: T } = profile;
  const s0 = 2;

  const desiredGap =
    s0 +
    Math.max(
      0,
      currentSpeed * T +
        (currentSpeed * approachingRate) / (2 * Math.sqrt(a * b))
    );

  const freeRoadTerm = Math.pow(currentSpeed / desiredSpeed, 4);
  const interactionTerm = Math.pow(desiredGap / Math.max(gap, 0.1), 2);

  return a * (1 - freeRoadTerm - interactionTerm);
}
