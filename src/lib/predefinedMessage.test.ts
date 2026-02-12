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
  DEFAULT_PREDEFINED_MESSAGE,
  getPredefinedMessageConfig,
  resetPredefinedMessageConfig,
  resolvePredefinedMessage,
  setPredefinedMessageConfig
} from "./predefinedMessage";

describe("predefinedMessage", () => {
  beforeEach(() => {
    mocks.memory.clear();
    vi.clearAllMocks();
  });

  it("returns default config when storage is empty", async () => {
    const config = await getPredefinedMessageConfig();
    expect(config).toEqual({
      useCustomMessage: false,
      message: DEFAULT_PREDEFINED_MESSAGE
    });
  });

  it("persists and restores custom config", async () => {
    await setPredefinedMessageConfig({
      useCustomMessage: true,
      message: "Je suis arrive, tout va bien."
    });

    const config = await getPredefinedMessageConfig();
    expect(config).toEqual({
      useCustomMessage: true,
      message: "Je suis arrive, tout va bien."
    });
  });

  it("resets to default values", async () => {
    await setPredefinedMessageConfig({
      useCustomMessage: true,
      message: "Temp"
    });
    await resetPredefinedMessageConfig();

    const config = await getPredefinedMessageConfig();
    expect(config).toEqual({
      useCustomMessage: false,
      message: DEFAULT_PREDEFINED_MESSAGE
    });
  });

  it("resolves default message when custom is disabled or blank", () => {
    expect(
      resolvePredefinedMessage({
        useCustomMessage: false,
        message: "Message perso"
      })
    ).toBe(DEFAULT_PREDEFINED_MESSAGE);

    expect(
      resolvePredefinedMessage({
        useCustomMessage: true,
        message: "   "
      })
    ).toBe(DEFAULT_PREDEFINED_MESSAGE);
  });

  it("resolves trimmed custom message when enabled", () => {
    expect(
      resolvePredefinedMessage({
        useCustomMessage: true,
        message: "  Je suis chez moi  "
      })
    ).toBe("Je suis chez moi");
  });
});
