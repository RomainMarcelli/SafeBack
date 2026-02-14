import AsyncStorage from "@react-native-async-storage/async-storage";

const PRIVACY_EVENTS_KEY = "safeback:privacy_events";

export type PrivacyEvent = {
  id: string;
  type:
    | "share_enabled"
    | "share_disabled"
    | "guardian_check_enabled"
    | "guardian_check_disabled"
    | "offline_trip_queued"
    | "offline_trip_synced"
    | "battery_alert_shared"
    | "auto_checkin_arrival"
    | "privacy_reset"
    | "permission_snapshot";
  message: string;
  createdAtIso: string;
  data?: Record<string, unknown> | null;
};

// Normalise les journaux persistés pour conserver la rétrocompatibilité entre versions de l'app.
function normalizePrivacyEvents(raw: unknown): PrivacyEvent[] {
  if (!Array.isArray(raw)) return [];
  const normalized: PrivacyEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    const type = String(row.type ?? "").trim();
    const message = String(row.message ?? "").trim();
    const createdAtIso = String(row.createdAtIso ?? "").trim();
    if (!id || !type || !message || !createdAtIso) continue;
    normalized.push({
      id,
      type: type as PrivacyEvent["type"],
      message,
      createdAtIso,
      data: (row.data ?? null) as Record<string, unknown> | null
    });
  }
  return normalized;
}

export async function listPrivacyEvents(limit = 100): Promise<PrivacyEvent[]> {
  const raw = await AsyncStorage.getItem(PRIVACY_EVENTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return normalizePrivacyEvents(parsed).slice(0, limit);
  } catch {
    return [];
  }
}

export async function logPrivacyEvent(payload: {
  type: PrivacyEvent["type"];
  message: string;
  data?: Record<string, unknown> | null;
}): Promise<void> {
  // Préfixe le dernier événement pour garder des lectures O(1) sur les actions de confidentialité récentes.
  const current = await listPrivacyEvents(300);
  const next: PrivacyEvent[] = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      type: payload.type,
      message: payload.message.trim(),
      createdAtIso: new Date().toISOString(),
      data: payload.data ?? null
    },
    ...current
  ].slice(0, 300);
  await AsyncStorage.setItem(PRIVACY_EVENTS_KEY, JSON.stringify(next));
}

export async function clearPrivacyEvents(): Promise<void> {
  await AsyncStorage.removeItem(PRIVACY_EVENTS_KEY);
}
