// Tests unitaires des helpers "sessions appareils" (enregistrement + révocation).
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  sessionUserId: "user-1" as string | null,
  storedDeviceId: "device-123" as string | null,
  upsertResult: {
    data: {
      id: "row-1",
      user_id: "user-1",
      device_id: "device-123",
      device_label: "iPhone",
      platform: "ios",
      app_version: "1.0.0",
      last_seen_at: "2026-02-15T12:00:00.000Z",
      revoked_at: null
    },
    error: null
  } as { data: any; error: any },
  listResult: { data: [] as any[], error: null } as { data: any; error: any },
  maybeSingleResult: { data: { revoked_at: null }, error: null } as { data: any; error: any },
  rpcResult: { data: 2, error: null } as { data: any; error: any },
  calls: [] as Array<{ action: string; args?: any[]; payload?: any }>
}));

vi.mock("expo-constants", () => ({
  default: {
    deviceName: "iPhone de test",
    platform: {
      ios: {}
    },
    expoConfig: {
      version: "1.0.0"
    }
  }
}));

vi.mock("../core/secureStorage", () => ({
  getSensitiveString: vi.fn(async () => state.storedDeviceId),
  setSensitiveString: vi.fn(async (_key: string, value: string) => {
    state.storedDeviceId = value;
  })
}));

function createChain() {
  const chain: any = {};
  chain.upsert = vi.fn((payload: any, ...args: any[]) => {
    state.calls.push({ action: "upsert", payload, args });
    return chain;
  });
  chain.select = vi.fn((...args: any[]) => {
    state.calls.push({ action: "select", args });
    return chain;
  });
  chain.single = vi.fn(async () => state.upsertResult);
  chain.eq = vi.fn((...args: any[]) => {
    state.calls.push({ action: "eq", args });
    return chain;
  });
  chain.maybeSingle = vi.fn(async () => state.maybeSingleResult);
  chain.order = vi.fn(async (...args: any[]) => {
    state.calls.push({ action: "order", args });
    return state.listResult;
  });
  return chain;
}

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(() => createChain()),
  rpc: vi.fn(async (...args: any[]) => {
    state.calls.push({ action: "rpc", args });
    return state.rpcResult;
  }),
  auth: {
    getSession: vi.fn(async () => ({
      data: {
        session: state.sessionUserId ? { user: { id: state.sessionUserId } } : null
      }
    }))
  }
}));

vi.mock("../core/supabase", () => ({
  supabase: supabaseMock
}));

import {
  disconnectOtherDevices,
  getOrCreateCurrentDeviceId,
  isCurrentDeviceRevoked,
  listMyDeviceSessions,
  upsertCurrentDeviceSession
} from "./deviceSessions";

describe("deviceSessions", () => {
  beforeEach(() => {
    state.sessionUserId = "user-1";
    state.storedDeviceId = "device-123";
    state.calls = [];
    state.upsertResult = {
      data: {
        id: "row-1",
        user_id: "user-1",
        device_id: "device-123",
        device_label: "iPhone",
        platform: "ios",
        app_version: "1.0.0",
        last_seen_at: "2026-02-15T12:00:00.000Z",
        revoked_at: null
      },
      error: null
    };
    state.listResult = { data: [{ id: "row-1" }], error: null };
    state.maybeSingleResult = { data: { revoked_at: null }, error: null };
    state.rpcResult = { data: 2, error: null };
    vi.clearAllMocks();
  });

  it("retourne l'id appareil déjà persisté", async () => {
    await expect(getOrCreateCurrentDeviceId()).resolves.toBe("device-123");
  });

  it("upsertCurrentDeviceSession écrit une session appareil", async () => {
    const row = await upsertCurrentDeviceSession();
    expect(row?.device_id).toBe("device-123");
    const upsertCall = state.calls.find((call) => call.action === "upsert");
    expect(upsertCall?.payload.revoked_at).toBeNull();
    expect(upsertCall?.payload.user_id).toBe("user-1");
  });

  it("upsertCurrentDeviceSession retourne null hors session auth", async () => {
    state.sessionUserId = null;
    await expect(upsertCurrentDeviceSession()).resolves.toBeNull();
  });

  it("listMyDeviceSessions lit les sessions triées", async () => {
    const rows = await listMyDeviceSessions();
    expect(rows).toHaveLength(1);
    expect(state.calls.some((call) => call.action === "order")).toBe(true);
  });

  it("disconnectOtherDevices utilise le RPC dédié", async () => {
    await expect(disconnectOtherDevices()).resolves.toBe(2);
    const rpcCall = state.calls.find((call) => call.action === "rpc");
    expect(rpcCall?.args?.[0]).toBe("revoke_other_device_sessions");
    expect(rpcCall?.args?.[1]).toEqual({ p_current_device_id: "device-123" });
  });

  it("isCurrentDeviceRevoked détecte une session révoquée", async () => {
    state.maybeSingleResult = { data: { revoked_at: "2026-02-15T12:00:00.000Z" }, error: null };
    await expect(isCurrentDeviceRevoked()).resolves.toBe(true);
  });
});
