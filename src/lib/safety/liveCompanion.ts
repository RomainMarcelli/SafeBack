// Configuration locale du mode "Accompagnement en direct" pour garder les étapes du co-pilote.
import AsyncStorage from "@react-native-async-storage/async-storage";

const LIVE_COMPANION_KEY = "safeback:live_companion_prefs";

export type LiveCompanionCheckpoint = {
  id: string;
  label: string;
  done: boolean;
};

export type LiveCompanionPrefs = {
  etaReminderMinutes: number;
  checkpoints: LiveCompanionCheckpoint[];
};

export const DEFAULT_LIVE_COMPANION_PREFS: LiveCompanionPrefs = {
  etaReminderMinutes: 10,
  checkpoints: [
    { id: "departure", label: "Départ validé", done: false },
    { id: "midway", label: "Mi-parcours confirmé", done: false },
    { id: "arrival", label: "Arrivée confirmée", done: false }
  ]
};

function normalizeCheckpoints(input: unknown): LiveCompanionCheckpoint[] {
  if (!Array.isArray(input)) return DEFAULT_LIVE_COMPANION_PREFS.checkpoints;
  const sanitized = input
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const id = String(raw.id ?? "").trim();
      const label = String(raw.label ?? "").trim();
      if (!id || !label) return null;
      return {
        id,
        label,
        done: Boolean(raw.done)
      };
    })
    .filter((item): item is LiveCompanionCheckpoint => Boolean(item));
  return sanitized.length > 0 ? sanitized : DEFAULT_LIVE_COMPANION_PREFS.checkpoints;
}

export async function getLiveCompanionPrefs(): Promise<LiveCompanionPrefs> {
  const raw = await AsyncStorage.getItem(LIVE_COMPANION_KEY);
  if (!raw) return DEFAULT_LIVE_COMPANION_PREFS;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const etaReminderMinutes = Math.max(1, Math.round(Number(parsed.etaReminderMinutes ?? 10)));
    return {
      etaReminderMinutes,
      checkpoints: normalizeCheckpoints(parsed.checkpoints)
    };
  } catch {
    return DEFAULT_LIVE_COMPANION_PREFS;
  }
}

export async function setLiveCompanionPrefs(prefs: LiveCompanionPrefs): Promise<LiveCompanionPrefs> {
  const normalized: LiveCompanionPrefs = {
    etaReminderMinutes: Math.max(1, Math.round(Number(prefs.etaReminderMinutes ?? 10))),
    checkpoints: normalizeCheckpoints(prefs.checkpoints)
  };
  await AsyncStorage.setItem(LIVE_COMPANION_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function resetLiveCompanionPrefs(): Promise<LiveCompanionPrefs> {
  await AsyncStorage.removeItem(LIVE_COMPANION_KEY);
  return DEFAULT_LIVE_COMPANION_PREFS;
}
