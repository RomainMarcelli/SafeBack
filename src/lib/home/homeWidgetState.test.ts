// Tests unitaires pour valider le comportement de `homeWidgetState` et prévenir les régressions.
import { beforeEach, describe, expect, it, vi } from "vitest";

const storageState = vi.hoisted(() => ({
  values: {} as Record<string, string | null>
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storageState.values[key] ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storageState.values[key] = value;
    })
  }
}));

import {
  DEFAULT_HOME_WIDGET_STATE,
  formatWidgetStatusLabel,
  formatWidgetUpdatedAt,
  getHomeWidgetState,
  resetHomeWidgetState,
  setHomeWidgetState
} from "./homeWidgetState";

describe("homeWidgetState", () => {
  beforeEach(() => {
    storageState.values = {};
    vi.clearAllMocks();
  });

  it("returns defaults when storage is empty", async () => {
    await expect(getHomeWidgetState()).resolves.toEqual(DEFAULT_HOME_WIDGET_STATE);
  });

  it("stores and merges state patches", async () => {
    const first = await setHomeWidgetState({
      status: "trip_active",
      fromAddress: "Paris",
      toAddress: "Lyon",
      note: "En cours"
    });
    expect(first.status).toBe("trip_active");
    expect(first.fromAddress).toBe("Paris");

    const second = await setHomeWidgetState({
      status: "arrived",
      note: "Rentre"
    });
    expect(second.status).toBe("arrived");
    expect(second.fromAddress).toBe("Paris");
    expect(second.toAddress).toBe("Lyon");
    expect(second.note).toBe("Rentre");
  });

  it("resets state to defaults with timestamp", async () => {
    await setHomeWidgetState({
      status: "trip_active",
      fromAddress: "A",
      toAddress: "B",
      note: "x"
    });
    await resetHomeWidgetState();

    const state = await getHomeWidgetState();
    expect(state.status).toBe("idle");
    expect(state.fromAddress).toBe("");
    expect(state.toAddress).toBe("");
    expect(state.note).toBe("Pret");
    expect(state.updatedAtIso.length).toBeGreaterThan(0);
  });

  it("formats status labels and updatedAt", () => {
    expect(formatWidgetStatusLabel("idle")).toBe("Pret");
    expect(formatWidgetStatusLabel("trip_active")).toBe("Trajet actif");
    expect(formatWidgetStatusLabel("arrived")).toBe("Bien rentre");
    expect(formatWidgetUpdatedAt("")).toBe("--:--");
    expect(formatWidgetUpdatedAt("invalid-date")).toBe("--:--");
    expect(formatWidgetUpdatedAt("2026-02-12T08:05:00.000Z")).toMatch(/^\d{2}:\d{2}$/);
  });
});
