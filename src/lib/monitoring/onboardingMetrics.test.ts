// Tests métriques onboarding: temps de config et abandon d'étape.
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());
const tracked = vi.hoisted(() => [] as Array<Record<string, unknown>>);

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

vi.mock("./runtimeMonitoring", () => ({
  trackUxMetric: vi.fn(async (payload: Record<string, unknown>) => {
    tracked.push(payload);
  })
}));

import {
  abandonOnboardingConfigSession,
  completeOnboardingConfigSession,
  completeOnboardingStepMetric,
  startOnboardingConfigSession,
  startOnboardingStepMetric
} from "./onboardingMetrics";

describe("onboardingMetrics", () => {
  beforeEach(() => {
    store.clear();
    tracked.length = 0;
    vi.clearAllMocks();
  });

  it("mesure la durée complète de configuration onboarding", async () => {
    await startOnboardingConfigSession("u1");
    await completeOnboardingConfigSession("u1");
    const started = tracked.find((item) => item.name === "onboarding_config_started");
    const completed = tracked.find((item) => item.name === "onboarding_config_completed");
    expect(started).toBeTruthy();
    expect(completed).toBeTruthy();
    expect(Number(completed?.durationMs ?? 0)).toBeGreaterThanOrEqual(0);
  });

  it("trace l'abandon de configuration", async () => {
    await startOnboardingConfigSession("u2");
    await abandonOnboardingConfigSession("u2", "dismissed");
    const abandoned = tracked.find((item) => item.name === "onboarding_config_abandoned");
    expect(abandoned).toBeTruthy();
  });

  it("trace le cycle étape onboarding start -> complete", async () => {
    await startOnboardingStepMetric("u3", "profile");
    await completeOnboardingStepMetric("u3", "profile");
    const started = tracked.find((item) => item.name === "onboarding_step_started");
    const completed = tracked.find((item) => item.name === "onboarding_step_completed");
    expect(started).toBeTruthy();
    expect(completed).toBeTruthy();
  });
});
