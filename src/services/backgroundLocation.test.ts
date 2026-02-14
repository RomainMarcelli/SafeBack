// Tests unitaires pour valider le comportement de `backgroundLocation` et prévenir les régressions.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    constants: { appOwnership: "standalone" },
    store,
    defineTask: vi.fn(),
    requestBackgroundPermissionsAsync: vi.fn(),
    startLocationUpdatesAsync: vi.fn(),
    hasStartedLocationUpdatesAsync: vi.fn(),
    stopLocationUpdatesAsync: vi.fn(),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    removeItem: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    insertLocationPoint: vi.fn(async () => ({ id: "loc-1" }))
  };
});

vi.mock("expo-constants", () => ({
  default: mocks.constants
}));

vi.mock("expo-task-manager", () => ({
  defineTask: mocks.defineTask
}));

vi.mock("expo-location", () => ({
  Accuracy: { Balanced: "balanced" },
  requestBackgroundPermissionsAsync: mocks.requestBackgroundPermissionsAsync,
  startLocationUpdatesAsync: mocks.startLocationUpdatesAsync,
  hasStartedLocationUpdatesAsync: mocks.hasStartedLocationUpdatesAsync,
  stopLocationUpdatesAsync: mocks.stopLocationUpdatesAsync
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    setItem: mocks.setItem,
    getItem: mocks.getItem,
    removeItem: mocks.removeItem
  }
}));

vi.mock("../lib/core/db", () => ({
  insertLocationPoint: mocks.insertLocationPoint
}));

const SESSION_KEY = "safeback:sessionId";

describe("backgroundLocation service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.store.clear();
    mocks.constants.appOwnership = "standalone";
    mocks.requestBackgroundPermissionsAsync.mockResolvedValue({ status: "granted" });
    mocks.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
  });

  it("refuses background tracking on Expo Go", async () => {
    mocks.constants.appOwnership = "expo";
    const mod = await import("./backgroundLocation");
    await expect(mod.startBackgroundTracking("session-1")).rejects.toThrow(
      "Suivi en arriere-plan indisponible sur Expo Go."
    );
  });

  it("starts tracking and stores session id when permission is granted", async () => {
    const mod = await import("./backgroundLocation");

    await mod.startBackgroundTracking("session-1");

    expect(mocks.setItem).toHaveBeenCalledWith(SESSION_KEY, "session-1");
    expect(mocks.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
    expect(mocks.defineTask).toHaveBeenCalledTimes(1);
  });

  it("throws when background permission is denied", async () => {
    mocks.requestBackgroundPermissionsAsync.mockResolvedValue({ status: "denied" });
    const mod = await import("./backgroundLocation");

    await expect(mod.startBackgroundTracking("session-1")).rejects.toThrow(
      "Permission background refusee"
    );
    expect(mocks.startLocationUpdatesAsync).not.toHaveBeenCalled();
  });

  it("stores location points from background task callback", async () => {
    const mod = await import("./backgroundLocation");
    await mod.startBackgroundTracking("session-1");

    const callback = mocks.defineTask.mock.calls[0]?.[1];
    expect(callback).toBeTypeOf("function");

    await callback({
      data: {
        locations: [{ coords: { latitude: 48.8566, longitude: 2.3522, accuracy: 4 } }]
      }
    });

    expect(mocks.insertLocationPoint).toHaveBeenCalledWith({
      session_id: "session-1",
      latitude: 48.8566,
      longitude: 2.3522,
      accuracy: 4
    });
  });

  it("ignores callback when task payload has an error", async () => {
    const mod = await import("./backgroundLocation");
    await mod.startBackgroundTracking("session-1");
    const callback = mocks.defineTask.mock.calls[0]?.[1];

    await callback({
      error: new Error("task failed"),
      data: {
        locations: [{ coords: { latitude: 48.8566, longitude: 2.3522 } }]
      }
    });

    expect(mocks.insertLocationPoint).not.toHaveBeenCalled();
  });

  it("ignores callback when there is no stored session id", async () => {
    const mod = await import("./backgroundLocation");
    await mod.startBackgroundTracking("session-1");
    await mocks.removeItem(SESSION_KEY);
    const callback = mocks.defineTask.mock.calls[0]?.[1];

    await callback({
      data: {
        locations: [{ coords: { latitude: 48.8566, longitude: 2.3522 } }]
      }
    });

    expect(mocks.insertLocationPoint).not.toHaveBeenCalled();
  });

  it("swallows insert errors in background callback", async () => {
    mocks.insertLocationPoint.mockRejectedValueOnce(new Error("insert failed"));
    const mod = await import("./backgroundLocation");
    await mod.startBackgroundTracking("session-1");
    const callback = mocks.defineTask.mock.calls[0]?.[1];

    await expect(
      callback({
        data: {
          locations: [{ coords: { latitude: 48.8566, longitude: 2.3522 } }]
        }
      })
    ).resolves.toBeUndefined();
  });

  it("stopBackgroundTracking is a no-op on Expo Go", async () => {
    mocks.constants.appOwnership = "expo";
    const mod = await import("./backgroundLocation");

    await mod.stopBackgroundTracking();

    expect(mocks.removeItem).not.toHaveBeenCalled();
    expect(mocks.stopLocationUpdatesAsync).not.toHaveBeenCalled();
  });

  it("stopBackgroundTracking stops updates and clears session key", async () => {
    mocks.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
    const mod = await import("./backgroundLocation");

    await mod.stopBackgroundTracking();

    expect(mocks.stopLocationUpdatesAsync).toHaveBeenCalledTimes(1);
    expect(mocks.removeItem).toHaveBeenCalledWith(SESSION_KEY);
  });

  it("defines task only once even if start is called twice", async () => {
    const mod = await import("./backgroundLocation");

    await mod.startBackgroundTracking("session-1");
    await mod.startBackgroundTracking("session-2");

    expect(mocks.defineTask).toHaveBeenCalledTimes(1);
    expect(mocks.startLocationUpdatesAsync).toHaveBeenCalledTimes(2);
  });
});
