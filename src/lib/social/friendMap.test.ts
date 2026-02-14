// Tests unitaires sur les helpers de statut en ligne de la carte des proches.
import { describe, expect, it } from "vitest";
import { getFriendOnlineState, normalizeMarkerEmoji } from "./friendMapStatus";

describe("friendMap helpers", () => {
  it("normalizeMarkerEmoji fallback", () => {
    expect(normalizeMarkerEmoji()).toBe("🧭");
    expect(normalizeMarkerEmoji("   ")).toBe("🧭");
  });

  it("online quand heartbeat recent et reseau ok", () => {
    const now = Date.parse("2026-02-14T12:00:00.000Z");
    expect(
      getFriendOnlineState(
        {
          network_connected: true,
          updated_at: "2026-02-14T11:59:10.000Z"
        },
        now
      )
    ).toBe("online");
  });

  it("recently_offline quand heartbeat recent mais reseau coupe", () => {
    const now = Date.parse("2026-02-14T12:00:00.000Z");
    expect(
      getFriendOnlineState(
        {
          network_connected: false,
          updated_at: "2026-02-14T11:56:00.000Z"
        },
        now
      )
    ).toBe("recently_offline");
  });

  it("offline quand heartbeat trop ancien", () => {
    const now = Date.parse("2026-02-14T12:00:00.000Z");
    expect(
      getFriendOnlineState(
        {
          network_connected: true,
          updated_at: "2026-02-14T11:30:00.000Z"
        },
        now
      )
    ).toBe("offline");
  });
});
