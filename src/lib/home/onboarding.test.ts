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

import {
  getOnboardingAssistantSession,
  getOnboardingState,
  markOnboardingManualStep,
  resetOnboardingExperience,
  setOnboardingCompleted,
  startOnboardingAssistant
} from "./onboarding";

describe("onboarding", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it("resetOnboardingExperience clears state and assistant session", async () => {
    const userId = "user-reset";
    await markOnboardingManualStep(userId, "friends_map");
    await setOnboardingCompleted(userId);
    await startOnboardingAssistant(userId, "first_trip");

    const reset = await resetOnboardingExperience(userId);

    expect(reset.state.completed).toBe(false);
    expect(reset.state.dismissed).toBe(false);
    expect(reset.state.manualDone).toEqual([]);
    expect(reset.assistant.active).toBe(false);
    expect(reset.assistant.stepId).toBe("profile");

    const state = await getOnboardingState(userId);
    const assistant = await getOnboardingAssistantSession(userId);
    expect(state.completed).toBe(false);
    expect(state.manualDone).toEqual([]);
    expect(assistant.active).toBe(false);
    expect(assistant.stepId).toBe("profile");
  });
});

