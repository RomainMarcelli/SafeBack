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
  getDiscoveryProgress,
  hasVisitedRoute,
  markRouteVisited,
  markTutorialStepCompleted,
  resetDiscoveryProgress,
  setTutorialCurrentStepIndex,
  syncTutorialCompletionFromVisitedRoutes
} from "./discoveryProgress";

describe("discoveryProgress", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it("tracks visited routes and ignores duplicates", async () => {
    const userId = "user-1";
    await markRouteVisited(userId, "/setup");
    await markRouteVisited(userId, "/setup?from=test");
    const progress = await getDiscoveryProgress(userId);
    const setupCount = progress.visitedRoutes.filter((entry) => entry === "/setup").length;
    expect(setupCount).toBe(1);
    expect(hasVisitedRoute(progress.visitedRoutes, "/setup")).toBe(true);
  });

  it("stores tutorial cursor and manual completion", async () => {
    const userId = "user-2";
    await setTutorialCurrentStepIndex(userId, 7);
    await markTutorialStepCompleted(userId, "trajets:new-trip");
    const progress = await getDiscoveryProgress(userId);
    expect(progress.tutorialCurrentStepIndex).toBe(7);
    expect(progress.tutorialCompletedStepIds).toContain("trajets:new-trip");
  });

  it("auto-completes tutorial steps from visited routes", async () => {
    const userId = "user-3";
    await markRouteVisited(userId, "/setup");
    await markRouteVisited(userId, "/friends-map");
    const progress = await syncTutorialCompletionFromVisitedRoutes(userId);
    expect(progress.tutorialCompletedStepIds.some((id) => id.includes("new-trip"))).toBe(true);
    expect(progress.tutorialCompletedStepIds.some((id) => id.includes("friends-live-map"))).toBe(true);
  });

  it("resets badges and tutorial progress", async () => {
    const userId = "user-4";
    await markRouteVisited(userId, "/setup");
    await setTutorialCurrentStepIndex(userId, 6);
    await markTutorialStepCompleted(userId, "support:privacy-center");

    const reset = await resetDiscoveryProgress(userId);

    expect(reset.visitedRoutes).toEqual(["/"]);
    expect(reset.tutorialCurrentStepIndex).toBe(0);
    expect(reset.tutorialCompletedStepIds).toEqual([]);
  });
});
