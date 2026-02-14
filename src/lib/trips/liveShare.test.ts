// Tests unitaires pour valider le comportement de `liveShare` et prévenir les régressions.
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

  it("encodes special characters in deep link params", () => {
    const link = buildFriendViewLink({
      sessionId: "session/123",
      shareToken: "token=abc&x",
      scheme: "myapp"
    });
    expect(link).toBe("myapp://friend-view?sessionId=session%2F123&shareToken=token%3Dabc%26x");
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

  it("keeps points without date and sorts them before dated points", () => {
    const points = normalizeSharedLocationPoints([
      { latitude: 48.86, longitude: 2.35, recordedAt: "2026-02-11T10:05:00.000Z" },
      { latitude: 48.85, longitude: 2.34 },
      { latitude: 48.84, longitude: 2.33, recordedAt: "2026-02-11T10:01:00.000Z" }
    ]);

    expect(points[0]).toMatchObject({ latitude: 48.85, longitude: 2.34 });
    expect(points[1]).toMatchObject({ latitude: 48.84, longitude: 2.33 });
    expect(points[2]).toMatchObject({ latitude: 48.86, longitude: 2.35 });
  });
});
