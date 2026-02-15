import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const memory = new Map<string, string>();
  return {
    memory,
    asyncStorage: {
      getItem: vi.fn(async (key: string) => memory.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        memory.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        memory.delete(key);
      })
    }
  };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: mocks.asyncStorage
}));

import {
  DEFAULT_LIVE_COMPANION_PREFS,
  getLiveCompanionPrefs,
  resetLiveCompanionPrefs,
  setLiveCompanionPrefs
} from "./liveCompanion";

describe("liveCompanion storage", () => {
  beforeEach(() => {
    mocks.memory.clear();
    vi.clearAllMocks();
  });

  it("returns default prefs when storage is empty", async () => {
    await expect(getLiveCompanionPrefs()).resolves.toEqual(DEFAULT_LIVE_COMPANION_PREFS);
  });

  it("normalizes malformed values", async () => {
    await setLiveCompanionPrefs({
      etaReminderMinutes: 0,
      checkpoints: []
    });

    await expect(getLiveCompanionPrefs()).resolves.toEqual({
      etaReminderMinutes: 1,
      checkpoints: DEFAULT_LIVE_COMPANION_PREFS.checkpoints
    });
  });

  it("resets to defaults", async () => {
    await setLiveCompanionPrefs({
      etaReminderMinutes: 12,
      checkpoints: [{ id: "a", label: "A", done: true }]
    });

    await resetLiveCompanionPrefs();

    await expect(getLiveCompanionPrefs()).resolves.toEqual(DEFAULT_LIVE_COMPANION_PREFS);
  });
});
