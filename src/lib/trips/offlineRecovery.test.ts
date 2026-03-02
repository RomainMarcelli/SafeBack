// Scénarios réseau faible/offline + reprise après crash pour la file de trajets.
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());
const network = vi.hoisted(() => ({
  isConnected: true,
  isInternetReachable: true
}));
const state = vi.hoisted(() => ({
  sessionUserId: "user-offline",
  createdSessions: 0
}));

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

vi.mock("expo-network", () => ({
  getNetworkStateAsync: vi.fn(async () => ({
    isConnected: network.isConnected,
    isInternetReachable: network.isInternetReachable
  }))
}));

vi.mock("../core/db", () => ({
  createSessionWithContacts: vi.fn(async () => {
    state.createdSessions += 1;
    return { id: `session-${state.createdSessions}` };
  }),
  setSessionLiveShare: vi.fn(async () => ({
    share_live: true,
    share_token: "tok"
  }))
}));

vi.mock("../social/messagingDb", () => ({
  sendTripStartedSignalToGuardians: vi.fn(async () => ({ conversations: 1 }))
}));

vi.mock("../core/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: state.sessionUserId ? { user: { id: state.sessionUserId } } : null
        }
      }))
    }
  }
}));

describe("offline recovery", () => {
  beforeEach(() => {
    store.clear();
    network.isConnected = true;
    network.isInternetReachable = true;
    state.sessionUserId = "user-offline";
    state.createdSessions = 0;
    vi.clearAllMocks();
  });

  it("ne sync pas en réseau faible puis sync à la reconnexion", async () => {
    const mod = await import("./offlineTripQueue");
    await mod.enqueuePendingTripLaunch({
      fromAddress: "A",
      toAddress: "B",
      contactIds: [],
      shareLiveLocation: false
    });

    network.isConnected = true;
    network.isInternetReachable = false;
    const weakNetworkResult = await mod.syncPendingTripLaunches();
    expect(weakNetworkResult.syncedCount).toBe(0);
    expect(weakNetworkResult.remainingCount).toBe(1);

    network.isInternetReachable = true;
    const onlineResult = await mod.syncPendingTripLaunches();
    expect(onlineResult.syncedCount).toBe(1);
    expect(onlineResult.remainingCount).toBe(0);
  });

  it("reprend la queue après crash/restart (re-import module)", async () => {
    const mod1 = await import("./offlineTripQueue");
    await mod1.enqueuePendingTripLaunch({
      fromAddress: "CrashStart",
      toAddress: "CrashEnd",
      contactIds: ["c1"],
      shareLiveLocation: true
    });
    expect(await mod1.getPendingTripQueueCount()).toBe(1);

    vi.resetModules();

    const mod2 = await import("./offlineTripQueue");
    // La queue doit être relue depuis AsyncStorage après "redémarrage".
    expect(await mod2.getPendingTripQueueCount()).toBe(1);
    const syncResult = await mod2.syncPendingTripLaunches();
    expect(syncResult.syncedCount).toBe(1);
    expect(await mod2.getPendingTripQueueCount()).toBe(0);
  });
});
