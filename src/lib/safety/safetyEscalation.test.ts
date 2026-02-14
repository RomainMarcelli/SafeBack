// Tests unitaires pour valider le comportement de `safetyEscalation` et prévenir les régressions.
import { describe, expect, it } from "vitest";
import {
  computeSafetyEscalationSchedule,
  formatSafetyDelay,
  type SafetyEscalationConfig
} from "./safetyEscalation";

const CONFIG_30_120: SafetyEscalationConfig = {
  enabled: true,
  reminderDelayMinutes: 30,
  closeContactsDelayMinutes: 120
};

describe("safety escalation schedule", () => {
  it("uses route duration when expected arrival is not provided", () => {
    const now = new Date("2026-02-11T10:00:00.000Z");

    const result = computeSafetyEscalationSchedule({
      config: CONFIG_30_120,
      now,
      routeDurationMinutes: 20
    });

    // base = now + 20 min
    // reminder = base + 30 min = now + 50 min
    // close contacts = base + 120 min = now + 140 min
    expect(result.reminderDelaySeconds).toBe(50 * 60);
    expect(result.closeContactsDelaySeconds).toBe(140 * 60);
  });

  it("prioritizes expected arrival when provided and valid", () => {
    const now = new Date("2026-02-11T10:00:00.000Z");
    const expectedArrivalIso = "2026-02-11T10:45:00.000Z";

    const result = computeSafetyEscalationSchedule({
      config: CONFIG_30_120,
      now,
      expectedArrivalIso,
      routeDurationMinutes: 5
    });

    expect(result.baseAtIso).toBe(expectedArrivalIso);
    expect(result.reminderDelaySeconds).toBe(75 * 60);
    expect(result.closeContactsDelaySeconds).toBe(165 * 60);
  });

  it("does not schedule in the past when expected arrival is already passed", () => {
    const now = new Date("2026-02-11T10:00:00.000Z");

    const result = computeSafetyEscalationSchedule({
      config: CONFIG_30_120,
      now,
      expectedArrivalIso: "2026-02-11T08:00:00.000Z"
    });

    expect(result.baseAtIso).toBe("2026-02-11T10:00:00.000Z");
    expect(result.reminderDelaySeconds).toBe(30 * 60);
    expect(result.closeContactsDelaySeconds).toBe(120 * 60);
  });

  it("falls back to route duration when expected arrival is invalid", () => {
    const now = new Date("2026-02-11T10:00:00.000Z");

    const result = computeSafetyEscalationSchedule({
      config: CONFIG_30_120,
      now,
      expectedArrivalIso: "not-a-date",
      routeDurationMinutes: 10
    });

    expect(result.baseAtIso).toBe("2026-02-11T10:10:00.000Z");
    expect(result.reminderDelaySeconds).toBe(40 * 60);
    expect(result.closeContactsDelaySeconds).toBe(130 * 60);
  });

  it("keeps minimum 5 seconds delay for immediate schedule", () => {
    const now = new Date("2026-02-11T10:00:00.000Z");

    const result = computeSafetyEscalationSchedule({
      config: {
        enabled: true,
        reminderDelayMinutes: 0,
        closeContactsDelayMinutes: 0
      },
      now
    });

    expect(result.reminderDelaySeconds).toBe(5);
    expect(result.closeContactsDelaySeconds).toBe(5);
  });
});

describe("formatSafetyDelay", () => {
  it("formats minutes and hours", () => {
    expect(formatSafetyDelay(30)).toBe("30 min");
    expect(formatSafetyDelay(60)).toBe("1 h");
    expect(formatSafetyDelay(90)).toBe("1 h 30 min");
  });
});
