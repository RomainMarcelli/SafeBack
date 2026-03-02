// Tests unitaires du stockage sensible (SecureStore + fallback AsyncStorage).
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  secure: {} as Record<string, string>,
  async: {} as Record<string, string>,
  throwOnGet: false,
  throwOnSet: false,
  throwOnDelete: false
}));

vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "when_unlocked",
  getItemAsync: vi.fn(async (key: string) => {
    if (state.throwOnGet) throw new Error("secure get error");
    return state.secure[key] ?? null;
  }),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    if (state.throwOnSet) throw new Error("secure set error");
    state.secure[key] = value;
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    if (state.throwOnDelete) throw new Error("secure delete error");
    delete state.secure[key];
  })
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => state.async[key] ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      state.async[key] = value;
    }),
    removeItem: vi.fn(async (key: string) => {
      delete state.async[key];
    })
  }
}));

import {
  clearSensitiveKey,
  getSensitiveJson,
  getSensitiveString,
  secureAuthStorage,
  setSensitiveJson,
  setSensitiveString
} from "./secureStorage";

describe("secureStorage", () => {
  beforeEach(() => {
    state.secure = {};
    state.async = {};
    state.throwOnGet = false;
    state.throwOnSet = false;
    state.throwOnDelete = false;
    vi.clearAllMocks();
  });

  it("utilise SecureStore quand disponible", async () => {
    await setSensitiveString("k1", "v1");
    await expect(getSensitiveString("k1")).resolves.toBe("v1");
    await expect(secureAuthStorage.getItem("k1")).resolves.toBe("v1");
  });

  it("fallback AsyncStorage si SecureStore est indisponible", async () => {
    state.throwOnSet = true;
    await setSensitiveString("k2", "v2");
    expect(state.async["safeback:secure-fallback:k2"]).toBe("v2");

    state.throwOnGet = true;
    await expect(getSensitiveString("k2")).resolves.toBe("v2");
  });

  it("migre une ancienne clé legacy vers le fallback préfixé", async () => {
    state.throwOnGet = true;
    state.async.k3 = "legacy";
    await expect(secureAuthStorage.getItem("k3")).resolves.toBe("legacy");
    expect(state.async.k3).toBeUndefined();
    expect(state.async["safeback:secure-fallback:k3"]).toBe("legacy");
  });

  it("set/get JSON avec valeur de fallback", async () => {
    await expect(getSensitiveJson("missing-json", { ok: false })).resolves.toEqual({ ok: false });
    await setSensitiveJson("json-key", { ok: true });
    await expect(getSensitiveJson("json-key", { ok: false })).resolves.toEqual({ ok: true });
  });

  it("clearSensitiveKey supprime en secure + fallback", async () => {
    state.secure.k4 = "x";
    state.async["safeback:secure-fallback:k4"] = "x";
    await clearSensitiveKey("k4");
    expect(state.secure.k4).toBeUndefined();
    expect(state.async["safeback:secure-fallback:k4"]).toBeUndefined();
  });
});
