// Tests unitaires pour valider le comportement de `privacyCenter` et prévenir les régressions.
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => (store.has(key) ? store.get(key)! : null)),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      store.delete(key);
    })
  }
}));

import { clearPrivacyEvents, listPrivacyEvents, logPrivacyEvent } from "./privacyCenter";

describe("privacyCenter", () => {
  beforeEach(async () => {
    store.clear();
    vi.clearAllMocks();
    await clearPrivacyEvents();
  });

  it("logs and returns privacy events in reverse chronological order", async () => {
    await logPrivacyEvent({
      type: "share_enabled",
      message: "Share enabled"
    });
    await logPrivacyEvent({
      type: "share_disabled",
      message: "Share disabled"
    });

    const events = await listPrivacyEvents(10);

    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe("share_disabled");
    expect(events[1]?.type).toBe("share_enabled");
  });

  it("clears privacy events", async () => {
    await logPrivacyEvent({
      type: "privacy_reset",
      message: "reset"
    });

    await clearPrivacyEvents();

    await expect(listPrivacyEvents(10)).resolves.toEqual([]);
  });
});
