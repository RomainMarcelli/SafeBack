import AsyncStorage from "@react-native-async-storage/async-storage";

const SAFETY_ESCALATION_ENABLED_KEY = "safeback:safety_escalation_enabled";
const SAFETY_ESCALATION_REMINDER_KEY = "safeback:safety_escalation_reminder_minutes";
const SAFETY_ESCALATION_CLOSE_CONTACTS_KEY = "safeback:safety_escalation_close_contacts_minutes";

export const SAFETY_REMINDER_OPTIONS = [30, 60, 90] as const;
export const SAFETY_CLOSE_CONTACT_OPTIONS = [120, 180, 240] as const;

export type SafetyEscalationConfig = {
  enabled: boolean;
  reminderDelayMinutes: number;
  closeContactsDelayMinutes: number;
};

export type SafetyEscalationSchedule = {
  baseAtIso: string;
  reminderAtIso: string;
  closeContactsAtIso: string;
  reminderDelaySeconds: number;
  closeContactsDelaySeconds: number;
};

export const DEFAULT_SAFETY_ESCALATION_CONFIG: SafetyEscalationConfig = {
  enabled: true,
  reminderDelayMinutes: 30,
  closeContactsDelayMinutes: 120
};

function parsePositiveMinutes(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function ensureValidConfig(config: SafetyEscalationConfig): SafetyEscalationConfig {
  const reminderDelayMinutes = Math.max(1, Math.round(config.reminderDelayMinutes));
  const closeContactsDelayMinutes = Math.max(reminderDelayMinutes, Math.round(config.closeContactsDelayMinutes));
  return {
    enabled: config.enabled,
    reminderDelayMinutes,
    closeContactsDelayMinutes
  };
}

function toIsoOrNull(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function getSafetyEscalationConfig(): Promise<SafetyEscalationConfig> {
  const [enabledRaw, reminderRaw, closeContactsRaw] = await Promise.all([
    AsyncStorage.getItem(SAFETY_ESCALATION_ENABLED_KEY),
    AsyncStorage.getItem(SAFETY_ESCALATION_REMINDER_KEY),
    AsyncStorage.getItem(SAFETY_ESCALATION_CLOSE_CONTACTS_KEY)
  ]);

  return ensureValidConfig({
    enabled: enabledRaw !== "false",
    reminderDelayMinutes: parsePositiveMinutes(
      reminderRaw,
      DEFAULT_SAFETY_ESCALATION_CONFIG.reminderDelayMinutes
    ),
    closeContactsDelayMinutes: parsePositiveMinutes(
      closeContactsRaw,
      DEFAULT_SAFETY_ESCALATION_CONFIG.closeContactsDelayMinutes
    )
  });
}

export async function setSafetyEscalationConfig(config: SafetyEscalationConfig): Promise<void> {
  const normalized = ensureValidConfig(config);
  await Promise.all([
    AsyncStorage.setItem(SAFETY_ESCALATION_ENABLED_KEY, normalized.enabled ? "true" : "false"),
    AsyncStorage.setItem(SAFETY_ESCALATION_REMINDER_KEY, String(normalized.reminderDelayMinutes)),
    AsyncStorage.setItem(
      SAFETY_ESCALATION_CLOSE_CONTACTS_KEY,
      String(normalized.closeContactsDelayMinutes)
    )
  ]);
}

export async function resetSafetyEscalationConfig(): Promise<void> {
  await setSafetyEscalationConfig(DEFAULT_SAFETY_ESCALATION_CONFIG);
}

export function computeSafetyEscalationSchedule(params: {
  config: SafetyEscalationConfig;
  now?: Date;
  expectedArrivalIso?: string | null;
  routeDurationMinutes?: number | null;
}): SafetyEscalationSchedule {
  const now = params.now ?? new Date();
  const nowMs = now.getTime();

  const expectedArrivalIso = toIsoOrNull(params.expectedArrivalIso);
  const expectedArrivalMs = expectedArrivalIso ? new Date(expectedArrivalIso).getTime() : NaN;
  const routeDurationMinutes = Math.max(0, Math.round(params.routeDurationMinutes ?? 0));
  const routeBaseMs = nowMs + routeDurationMinutes * 60 * 1000;

  let baseMs = routeBaseMs;
  if (Number.isFinite(expectedArrivalMs)) {
    baseMs = expectedArrivalMs;
  }

  // Un planning ne peut pas être dans le passé : si l'arrivée prévue est déjà dépassée, on repart de maintenant.
  baseMs = Math.max(baseMs, nowMs);

  const reminderAtMs = baseMs + params.config.reminderDelayMinutes * 60 * 1000;
  const closeContactsAtMs = baseMs + params.config.closeContactsDelayMinutes * 60 * 1000;

  return {
    baseAtIso: new Date(baseMs).toISOString(),
    reminderAtIso: new Date(reminderAtMs).toISOString(),
    closeContactsAtIso: new Date(closeContactsAtMs).toISOString(),
    reminderDelaySeconds: Math.max(5, Math.round((reminderAtMs - nowMs) / 1000)),
    closeContactsDelaySeconds: Math.max(5, Math.round((closeContactsAtMs - nowMs) / 1000))
  };
}

export function formatSafetyDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${m} min`;
}

