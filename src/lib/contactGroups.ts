import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NotifyMode } from "./notifyChannels";

const CONTACT_GROUP_PROFILES_KEY = "safeback:contact_group_profiles";

export type ContactGroupKey = "family" | "colleagues" | "friends";

export type ContactGroupMeta = {
  key: ContactGroupKey;
  label: string;
  color: string;
  tintClassName: string;
};

export type ContactGroupProfile = {
  groupKey: ContactGroupKey;
  notifyMode: NotifyMode;
  sendOnDeparture: boolean;
  receiveDelayAlerts: boolean;
  sendOnArrival: boolean;
};

export type ContactGroupProfilesMap = Record<ContactGroupKey, ContactGroupProfile>;

export const CONTACT_GROUPS: ContactGroupMeta[] = [
  { key: "family", label: "Famille", color: "#0F766E", tintClassName: "text-emerald-700" },
  { key: "colleagues", label: "Collegues", color: "#1D4ED8", tintClassName: "text-blue-700" },
  { key: "friends", label: "Amis", color: "#7C3AED", tintClassName: "text-violet-700" }
];

export const DEFAULT_CONTACT_GROUP_PROFILES: ContactGroupProfilesMap = {
  family: {
    groupKey: "family",
    notifyMode: "auto",
    sendOnDeparture: true,
    receiveDelayAlerts: true,
    sendOnArrival: true
  },
  colleagues: {
    groupKey: "colleagues",
    notifyMode: "email",
    sendOnDeparture: true,
    receiveDelayAlerts: false,
    sendOnArrival: false
  },
  friends: {
    groupKey: "friends",
    notifyMode: "sms",
    sendOnDeparture: true,
    receiveDelayAlerts: true,
    sendOnArrival: true
  }
};

export function resolveContactGroup(value: string | null | undefined): ContactGroupKey {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "family") return "family";
  if (normalized === "colleagues") return "colleagues";
  return "friends";
}

export function getContactGroupMeta(groupKey: ContactGroupKey): ContactGroupMeta {
  return CONTACT_GROUPS.find((item) => item.key === groupKey) ?? CONTACT_GROUPS[2];
}

function normalizeProfile(input: Partial<ContactGroupProfile>, fallback: ContactGroupProfile): ContactGroupProfile {
  const notifyMode = input.notifyMode;
  const allowedModes: NotifyMode[] = ["auto", "app", "sms", "email", "whatsapp"];
  const safeMode = allowedModes.includes(notifyMode as NotifyMode)
    ? (notifyMode as NotifyMode)
    : fallback.notifyMode;

  return {
    groupKey: fallback.groupKey,
    notifyMode: safeMode,
    sendOnDeparture:
      typeof input.sendOnDeparture === "boolean"
        ? input.sendOnDeparture
        : fallback.sendOnDeparture,
    receiveDelayAlerts:
      typeof input.receiveDelayAlerts === "boolean"
        ? input.receiveDelayAlerts
        : fallback.receiveDelayAlerts,
    sendOnArrival:
      typeof input.sendOnArrival === "boolean"
        ? input.sendOnArrival
        : fallback.sendOnArrival
  };
}

export function mergeContactGroupProfiles(
  partial?: Partial<Record<ContactGroupKey, Partial<ContactGroupProfile>>> | null
): ContactGroupProfilesMap {
  return {
    family: normalizeProfile(partial?.family ?? {}, DEFAULT_CONTACT_GROUP_PROFILES.family),
    colleagues: normalizeProfile(partial?.colleagues ?? {}, DEFAULT_CONTACT_GROUP_PROFILES.colleagues),
    friends: normalizeProfile(partial?.friends ?? {}, DEFAULT_CONTACT_GROUP_PROFILES.friends)
  };
}

export async function getContactGroupProfiles(): Promise<ContactGroupProfilesMap> {
  const raw = await AsyncStorage.getItem(CONTACT_GROUP_PROFILES_KEY);
  if (!raw) return DEFAULT_CONTACT_GROUP_PROFILES;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<ContactGroupKey, Partial<ContactGroupProfile>>>;
    return mergeContactGroupProfiles(parsed);
  } catch {
    return DEFAULT_CONTACT_GROUP_PROFILES;
  }
}

export async function setContactGroupProfiles(
  profiles: Partial<Record<ContactGroupKey, Partial<ContactGroupProfile>>>
): Promise<ContactGroupProfilesMap> {
  const merged = mergeContactGroupProfiles(profiles);
  await AsyncStorage.setItem(CONTACT_GROUP_PROFILES_KEY, JSON.stringify(merged));
  return merged;
}

export async function resetContactGroupProfiles(): Promise<void> {
  await AsyncStorage.setItem(
    CONTACT_GROUP_PROFILES_KEY,
    JSON.stringify(DEFAULT_CONTACT_GROUP_PROFILES)
  );
}
