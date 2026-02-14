// Tests unitaires pour valider le comportement de `contactGroups` et prévenir les régressions.
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
  DEFAULT_CONTACT_GROUP_PROFILES,
  getContactGroupMeta,
  getContactGroupProfiles,
  mergeContactGroupProfiles,
  resetContactGroupProfiles,
  resolveContactGroup,
  setContactGroupProfiles
} from "./contactGroups";

describe("contactGroups", () => {
  beforeEach(() => {
    storageState.values = {};
    vi.clearAllMocks();
  });

  it("resolves unknown group to friends", () => {
    expect(resolveContactGroup("invalid")).toBe("friends");
    expect(resolveContactGroup(undefined)).toBe("friends");
  });

  it("returns metadata labels", () => {
    expect(getContactGroupMeta("family").label).toBe("Famille");
    expect(getContactGroupMeta("colleagues").label).toBe("Collegues");
    expect(getContactGroupMeta("friends").label).toBe("Amis");
  });

  it("merges partial profiles with defaults", () => {
    const merged = mergeContactGroupProfiles({
      colleagues: {
        notifyMode: "app",
        receiveDelayAlerts: true
      }
    });
    expect(merged.family.notifyMode).toBe(DEFAULT_CONTACT_GROUP_PROFILES.family.notifyMode);
    expect(merged.colleagues.notifyMode).toBe("app");
    expect(merged.colleagues.receiveDelayAlerts).toBe(true);
    expect(merged.friends.notifyMode).toBe(DEFAULT_CONTACT_GROUP_PROFILES.friends.notifyMode);
  });

  it("loads defaults when storage is empty or invalid", async () => {
    await expect(getContactGroupProfiles()).resolves.toEqual(DEFAULT_CONTACT_GROUP_PROFILES);
    storageState.values["safeback:contact_group_profiles"] = "{invalid json";
    await expect(getContactGroupProfiles()).resolves.toEqual(DEFAULT_CONTACT_GROUP_PROFILES);
  });

  it("persists and resets profiles", async () => {
    const saved = await setContactGroupProfiles({
      family: { notifyMode: "whatsapp", sendOnArrival: false }
    });

    expect(saved.family.notifyMode).toBe("whatsapp");
    expect(saved.family.sendOnArrival).toBe(false);

    const loaded = await getContactGroupProfiles();
    expect(loaded.family.notifyMode).toBe("whatsapp");
    expect(loaded.family.sendOnArrival).toBe(false);

    await resetContactGroupProfiles();
    const resetLoaded = await getContactGroupProfiles();
    expect(resetLoaded).toEqual(DEFAULT_CONTACT_GROUP_PROFILES);
  });
});
