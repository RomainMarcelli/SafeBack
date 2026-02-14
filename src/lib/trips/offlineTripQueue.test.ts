// Tests unitaires pour valider le comportement de `offlineTripQueue` et prévenir les régressions.
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());
const sessionUserIdState = vi.hoisted(() => ({
  value: "user-1" as string | null
}));
const networkState = vi.hoisted(() => ({
  isConnected: true,
  isInternetReachable: true
}));
const createSessionWithContactsMock = vi.hoisted(() => vi.fn());
const setSessionLiveShareMock = vi.hoisted(() => vi.fn());
const sendTripStartedSignalToGuardiansMock = vi.hoisted(() => vi.fn());
const logPrivacyEventMock = vi.hoisted(() => vi.fn());

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
    isConnected: networkState.isConnected,
    isInternetReachable: networkState.isInternetReachable
  }))
}));

vi.mock("../core/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: sessionUserIdState.value
            ? {
                user: { id: sessionUserIdState.value }
              }
            : null
        }
      }))
    }
  }
}));

vi.mock("../core/db", () => ({
  createSessionWithContacts: createSessionWithContactsMock,
  setSessionLiveShare: setSessionLiveShareMock
}));

vi.mock("./liveShare", () => ({
  createLiveShareToken: vi.fn(() => "share-token")
}));

vi.mock("../social/messagingDb", () => ({
  sendTripStartedSignalToGuardians: sendTripStartedSignalToGuardiansMock
}));

vi.mock("../privacy/privacyCenter", () => ({
  logPrivacyEvent: logPrivacyEventMock
}));

import {
  clearPendingTripQueue,
  enqueuePendingTripLaunch,
  getPendingTripQueueCount,
  listPendingTripLaunches,
  syncPendingTripLaunches
} from "./offlineTripQueue";

describe("offlineTripQueue", () => {
  beforeEach(async () => {
    store.clear();
    sessionUserIdState.value = "user-1";
    networkState.isConnected = true;
    networkState.isInternetReachable = true;
    vi.clearAllMocks();
    createSessionWithContactsMock.mockResolvedValue({ id: "session-1" });
    setSessionLiveShareMock.mockResolvedValue({});
    sendTripStartedSignalToGuardiansMock.mockResolvedValue({ conversations: 1 });
    logPrivacyEventMock.mockResolvedValue(undefined);
    await clearPendingTripQueue();
  });

  it("queues and lists pending trips", async () => {
    await enqueuePendingTripLaunch({
      fromAddress: "A",
      toAddress: "B",
      contactIds: ["c1"],
      expectedArrivalIso: null,
      shareLiveLocation: false
    });

    const rows = await listPendingTripLaunches();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fromAddress).toBe("A");
    expect(await getPendingTripQueueCount()).toBe(1);
  });

  it("syncs pending trips when online and authenticated", async () => {
    await enqueuePendingTripLaunch({
      fromAddress: "A",
      toAddress: "B",
      contactIds: ["c1"],
      expectedArrivalIso: "2026-02-14T20:00:00.000Z",
      shareLiveLocation: true
    });

    const result = await syncPendingTripLaunches();

    expect(result.syncedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.remainingCount).toBe(0);
    expect(createSessionWithContactsMock).toHaveBeenCalledTimes(1);
    expect(setSessionLiveShareMock).toHaveBeenCalledTimes(1);
    expect(sendTripStartedSignalToGuardiansMock).toHaveBeenCalledTimes(1);
  });

  it("does not sync when no active session", async () => {
    await enqueuePendingTripLaunch({
      fromAddress: "A",
      toAddress: "B",
      contactIds: ["c1"],
      shareLiveLocation: false
    });
    sessionUserIdState.value = null;

    const result = await syncPendingTripLaunches();

    expect(result.syncedCount).toBe(0);
    expect(result.remainingCount).toBe(1);
    expect(createSessionWithContactsMock).not.toHaveBeenCalled();
  });

  it("keeps failed rows in queue when sync fails", async () => {
    await enqueuePendingTripLaunch({
      fromAddress: "A",
      toAddress: "B",
      contactIds: ["c1"],
      shareLiveLocation: false
    });
    createSessionWithContactsMock.mockRejectedValueOnce(new Error("network timeout"));

    const result = await syncPendingTripLaunches();

    expect(result.syncedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.remainingCount).toBe(1);
  });
});
