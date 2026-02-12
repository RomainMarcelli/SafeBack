import { describe, expect, it } from "vitest";
import {
  buildFriendViewLink,
  createLiveShareToken,
  normalizeSharedLocationPoints
} from "./liveShare";

describe("liveShare helpers", () => {
  it("creates a non-empty share token", () => {
    const token = createLiveShareToken();
    expect(token.length).toBeGreaterThanOrEqual(12);
  });

  it("builds friend-view deep link", () => {
    const link = buildFriendViewLink({
      sessionId: "session-123",
      shareToken: "token-abc"
    });
    expect(link).toBe("safeback://friend-view?sessionId=session-123&shareToken=token-abc");
  });

  it("normalizes points by filtering invalid values and sorting by date", () => {
    const points = normalizeSharedLocationPoints([
      { latitude: 48.86, longitude: 2.35, recordedAt: "2026-02-11T10:05:00.000Z" },
      { latitude: 48.85, longitude: 2.34, recordedAt: "2026-02-11T10:01:00.000Z" },
      { latitude: 999, longitude: 2.31, recordedAt: "2026-02-11T10:00:00.000Z" }
    ]);

    expect(points).toHaveLength(2);
    expect(points[0].latitude).toBe(48.85);
    expect(points[1].latitude).toBe(48.86);
  });
});

