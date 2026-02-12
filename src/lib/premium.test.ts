import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const memory = new Map<string, string>();
  return {
    memory,
    asyncStorage: {
      getItem: vi.fn(async (key: string) => memory.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        memory.set(key, value);
      })
    }
  };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: mocks.asyncStorage
}));

import { getPremium, setPremium } from "./premium";

describe("premium storage", () => {
  beforeEach(() => {
    mocks.memory.clear();
    vi.clearAllMocks();
  });

  it("defaults to false when no value is stored", async () => {
    await expect(getPremium()).resolves.toBe(false);
  });

  it("returns true when premium is enabled", async () => {
    await setPremium(true);
    await expect(getPremium()).resolves.toBe(true);
  });

  it("returns false when premium is disabled", async () => {
    await setPremium(false);
    await expect(getPremium()).resolves.toBe(false);
  });

  it("treats unknown stored values as false", async () => {
    await mocks.asyncStorage.setItem("safeback:premium", "yes");
    await expect(getPremium()).resolves.toBe(false);
  });
});
