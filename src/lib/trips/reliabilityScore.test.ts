// Tests unitaires pour valider le comportement de `reliabilityScore` et prévenir les régressions.
import { describe, expect, it, vi } from "vitest";

vi.mock("../core/db", () => ({
  listSessions: vi.fn(async () => [])
}));

vi.mock("../social/messagingDb", () => ({
  listSecurityTimelineEvents: vi.fn(async () => [])
}));

import { computeReliabilityScore } from "./reliabilityScore";

describe("reliabilityScore", () => {
  it("returns excellent score when trips are confirmed with no incidents", () => {
    const result = computeReliabilityScore({
      trips: 10,
      arrivalConfirmations: 10,
      sosAlerts: 0,
      delayChecks: 0,
      lowBatteryAlerts: 0
    });

    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.level).toBe("excellent");
  });

  it("returns critical score when SOS and delay incidents accumulate", () => {
    const result = computeReliabilityScore({
      trips: 5,
      arrivalConfirmations: 1,
      sosAlerts: 3,
      delayChecks: 4,
      lowBatteryAlerts: 3
    });

    expect(result.score).toBeLessThan(50);
    expect(result.level).toBe("critical");
    expect(result.recommendations.length).toBeGreaterThan(1);
  });
});
