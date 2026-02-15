// Tests transport monitoring vers Supabase.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  sessionUserId: "user-transport" as string | null,
  runtimeInsertCalls: [] as any[],
  metricInsertCalls: [] as any[],
  runtimeInsertError: null as any,
  metricInsertError: null as any,
  isConnected: true,
  isInternetReachable: true
}));

vi.mock("expo-network", () => ({
  getNetworkStateAsync: vi.fn(async () => ({
    isConnected: state.isConnected,
    isInternetReachable: state.isInternetReachable
  }))
}));

vi.mock("../security/deviceSessions", () => ({
  getOrCreateCurrentDeviceId: vi.fn(async () => "device-test")
}));

vi.mock("./runtimeMonitoring", () => ({
  drainMonitoringQueues: vi.fn(async () => ({
    runtimeErrors: [
      {
        name: "Error",
        message: "boom",
        fatal: false,
        createdAtIso: new Date().toISOString(),
        context: "test"
      }
    ],
    uxMetrics: [
      {
        name: "metric",
        durationMs: 1200,
        createdAtIso: new Date().toISOString(),
        context: "test"
      }
    ]
  })),
  requeueMonitoringEvents: vi.fn(async () => {
    // no-op
  })
}));

vi.mock("../core/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: state.sessionUserId ? { user: { id: state.sessionUserId } } : null
        }
      }))
    },
    from: vi.fn((table: string) => ({
      insert: vi.fn(async (rows: any[]) => {
        if (table === "runtime_error_events") {
          state.runtimeInsertCalls.push(rows);
          return { error: state.runtimeInsertError };
        }
        state.metricInsertCalls.push(rows);
        return { error: state.metricInsertError };
      })
    }))
  }
}));

import { flushMonitoringToSupabase } from "./runtimeMonitoringTransport";

describe("runtimeMonitoringTransport", () => {
  beforeEach(() => {
    state.sessionUserId = "user-transport";
    state.runtimeInsertCalls = [];
    state.metricInsertCalls = [];
    state.runtimeInsertError = null;
    state.metricInsertError = null;
    state.isConnected = true;
    state.isInternetReachable = true;
    vi.clearAllMocks();
  });

  it("flush envoie runtime errors + metrics quand connecté", async () => {
    const result = await flushMonitoringToSupabase();
    expect(result.sentRuntimeErrors).toBe(1);
    expect(result.sentUxMetrics).toBe(1);
    expect(state.runtimeInsertCalls).toHaveLength(1);
    expect(state.metricInsertCalls).toHaveLength(1);
  });

  it("skip quand pas de session authentifiée", async () => {
    state.sessionUserId = null;
    const result = await flushMonitoringToSupabase();
    expect(result.skipped).toBe(true);
    expect(state.runtimeInsertCalls).toHaveLength(0);
  });

  it("skip quand réseau indisponible", async () => {
    state.isConnected = false;
    const result = await flushMonitoringToSupabase();
    expect(result.skipped).toBe(true);
    expect(state.runtimeInsertCalls).toHaveLength(0);
  });
});
