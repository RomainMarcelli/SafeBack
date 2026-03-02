// Tests monitoring runtime/UX: file locale, drain/requeue et capture globale.
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
  captureRuntimeError,
  drainMonitoringQueues,
  readMonitoringQueues,
  requeueMonitoringEvents,
  trackUxMetric
} from "./runtimeMonitoring";

describe("runtimeMonitoring", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it("captureRuntimeError ajoute une erreur dans la queue locale", async () => {
    await captureRuntimeError({
      error: new Error("boom"),
      context: "unit_test"
    });
    const queues = await readMonitoringQueues();
    expect(queues.runtimeErrors).toHaveLength(1);
    expect(queues.runtimeErrors[0].message).toContain("boom");
    expect(queues.runtimeErrors[0].context).toBe("unit_test");
  });

  it("trackUxMetric ajoute une métrique UX", async () => {
    await trackUxMetric({
      name: "onboarding_step_completed",
      durationMs: 1250,
      context: "profile"
    });
    const queues = await readMonitoringQueues();
    expect(queues.uxMetrics).toHaveLength(1);
    expect(queues.uxMetrics[0].name).toBe("onboarding_step_completed");
    expect(queues.uxMetrics[0].durationMs).toBe(1250);
  });

  it("drainMonitoringQueues vide partiellement les files", async () => {
    await captureRuntimeError({ error: new Error("e1") });
    await captureRuntimeError({ error: new Error("e2") });
    await trackUxMetric({ name: "m1" });
    await trackUxMetric({ name: "m2" });

    const drained = await drainMonitoringQueues({
      maxRuntimeErrors: 1,
      maxUxMetrics: 1
    });
    expect(drained.runtimeErrors).toHaveLength(1);
    expect(drained.uxMetrics).toHaveLength(1);

    const remaining = await readMonitoringQueues();
    expect(remaining.runtimeErrors).toHaveLength(1);
    expect(remaining.uxMetrics).toHaveLength(1);
  });

  it("requeueMonitoringEvents réinjecte les événements non envoyés", async () => {
    await requeueMonitoringEvents({
      runtimeErrors: [
        {
          name: "TypeError",
          message: "x",
          fatal: false,
          createdAtIso: new Date().toISOString()
        }
      ],
      uxMetrics: [
        {
          name: "config_time",
          durationMs: 900,
          createdAtIso: new Date().toISOString()
        }
      ]
    });
    const queues = await readMonitoringQueues();
    expect(queues.runtimeErrors).toHaveLength(1);
    expect(queues.uxMetrics).toHaveLength(1);
  });
});
