import AsyncStorage from "@react-native-async-storage/async-storage";

const SAFETY_ESCALATION_ENABLED_KEY = "safeback:safety_escalation_enabled";
const SAFETY_ESCALATION_REMINDER_KEY = "safeback:safety_escalation_reminder_minutes";
const SAFETY_ESCALATION_CLOSE_CONTACTS_KEY = "safeback:safety_escalation_close_contacts_minutes";
const SAFETY_ESCALATION_STAGE_ONE_DELAY_KEY = "safeback:safety_escalation_stage_one_delay_minutes";
const SAFETY_ESCALATION_STAGE_TWO_DELAY_KEY = "safeback:safety_escalation_stage_two_delay_minutes";
const SAFETY_ESCALATION_STAGE_THREE_DELAY_KEY = "safeback:safety_escalation_stage_three_delay_minutes";
const SAFETY_ESCALATION_STAGE_ONE_MODE_KEY = "safeback:safety_escalation_stage_one_mode";
const SAFETY_ESCALATION_STAGE_TWO_MODE_KEY = "safeback:safety_escalation_stage_two_mode";
const SAFETY_ESCALATION_STAGE_THREE_MODE_KEY = "safeback:safety_escalation_stage_three_mode";
const SAFETY_ESCALATION_SECURE_ARRIVAL_ENABLED_KEY = "safeback:secure_arrival_enabled";
const SAFETY_ESCALATION_SECURE_ARRIVAL_REQUIRE_LOCATION_KEY = "safeback:secure_arrival_require_location";
const SAFETY_ESCALATION_SECURE_ARRIVAL_REQUIRE_CHARGING_KEY = "safeback:secure_arrival_require_charging";
const SAFETY_ESCALATION_SECURE_ARRIVAL_MIN_TRIP_MINUTES_KEY = "safeback:secure_arrival_min_trip_minutes";

export const SAFETY_REMINDER_OPTIONS = [30, 60, 90] as const;
export const SAFETY_CLOSE_CONTACT_OPTIONS = [120, 180, 240] as const;
export const SAFETY_STAGE_ONE_OPTIONS = [10, 15, 20, 30] as const;
export const SAFETY_STAGE_TWO_OPTIONS = [20, 30, 45, 60] as const;
export const SAFETY_STAGE_THREE_OPTIONS = [30, 45, 60, 90] as const;
export const SAFETY_ESCALATION_MODES = ["in_app", "push", "sms"] as const;

export type SafetyEscalationMode = (typeof SAFETY_ESCALATION_MODES)[number];

export type SafetyEscalationConfig = {
  enabled: boolean;
  // Compat historique conservée.
  reminderDelayMinutes: number;
  closeContactsDelayMinutes: number;
  // Nouvelle escalade multi-niveau configurable.
  stageOneDelayMinutes: number;
  stageTwoDelayMinutes: number;
  stageThreeDelayMinutes: number;
  stageOneMode: SafetyEscalationMode;
  stageTwoMode: SafetyEscalationMode;
  stageThreeMode: SafetyEscalationMode;
  // Preuve d'arrivée sécurisée.
  secureArrivalEnabled: boolean;
  secureArrivalRequireLocation: boolean;
  secureArrivalRequireCharging: boolean;
  secureArrivalMinTripMinutes: number;
};

export type SafetyEscalationSchedule = {
  baseAtIso: string;
  reminderAtIso: string;
  closeContactsAtIso: string;
  stageOneAtIso: string;
  stageTwoAtIso: string;
  stageThreeAtIso: string;
  reminderDelaySeconds: number;
  closeContactsDelaySeconds: number;
  stageOneDelaySeconds: number;
  stageTwoDelaySeconds: number;
  stageThreeDelaySeconds: number;
};

export const DEFAULT_SAFETY_ESCALATION_CONFIG: SafetyEscalationConfig = {
  enabled: true,
  reminderDelayMinutes: 10,
  closeContactsDelayMinutes: 20,
  stageOneDelayMinutes: 10,
  stageTwoDelayMinutes: 20,
  stageThreeDelayMinutes: 30,
  stageOneMode: "in_app",
  stageTwoMode: "push",
  stageThreeMode: "sms",
  secureArrivalEnabled: false,
  secureArrivalRequireLocation: true,
  secureArrivalRequireCharging: false,
  secureArrivalMinTripMinutes: 3
};

function parsePositiveMinutes(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function parseNonNegativeMinutes(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed);
}

function toMode(value: string | null | undefined, fallback: SafetyEscalationMode): SafetyEscalationMode {
  if (!value) return fallback;
  return SAFETY_ESCALATION_MODES.includes(value as SafetyEscalationMode)
    ? (value as SafetyEscalationMode)
    : fallback;
}

function ensureValidConfig(config: SafetyEscalationConfig): SafetyEscalationConfig {
  const stageOneDelayMinutes = Math.max(1, Math.round(config.stageOneDelayMinutes ?? config.reminderDelayMinutes));
  const stageTwoDelayMinutes = Math.max(
    stageOneDelayMinutes,
    Math.round(config.stageTwoDelayMinutes ?? config.closeContactsDelayMinutes)
  );
  const stageThreeDelayMinutes = Math.max(
    stageTwoDelayMinutes,
    Math.round(config.stageThreeDelayMinutes ?? stageTwoDelayMinutes + 10)
  );

  return {
    enabled: config.enabled,
    reminderDelayMinutes: stageOneDelayMinutes,
    closeContactsDelayMinutes: stageTwoDelayMinutes,
    stageOneDelayMinutes,
    stageTwoDelayMinutes,
    stageThreeDelayMinutes,
    stageOneMode: toMode(config.stageOneMode, "in_app"),
    stageTwoMode: toMode(config.stageTwoMode, "push"),
    stageThreeMode: toMode(config.stageThreeMode, "sms"),
    secureArrivalEnabled: Boolean(config.secureArrivalEnabled),
    secureArrivalRequireLocation: config.secureArrivalRequireLocation !== false,
    secureArrivalRequireCharging: Boolean(config.secureArrivalRequireCharging),
    secureArrivalMinTripMinutes: Math.max(0, Math.round(config.secureArrivalMinTripMinutes ?? 0))
  };
}

function toIsoOrNull(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function getSafetyEscalationConfig(): Promise<SafetyEscalationConfig> {
  const [
    enabledRaw,
    reminderRaw,
    closeContactsRaw,
    stageOneRaw,
    stageTwoRaw,
    stageThreeRaw,
    stageOneModeRaw,
    stageTwoModeRaw,
    stageThreeModeRaw,
    secureArrivalEnabledRaw,
    secureArrivalRequireLocationRaw,
    secureArrivalRequireChargingRaw,
    secureArrivalMinTripMinutesRaw
  ] = await Promise.all([
    AsyncStorage.getItem(SAFETY_ESCALATION_ENABLED_KEY),
    AsyncStorage.getItem(SAFETY_ESCALATION_REMINDER_KEY),
    AsyncStorage.getItem(SAFETY_ESCALATION_CLOSE_CONTACTS_KEY),
    AsyncStorage.getItem(SAFETY_ESCALATION_STAGE_ONE_DELAY_KEY),
    AsyncStorage.getItem(SAFETY_ESCALATION_STAGE_TWO_DELAY_KEY),
    AsyncStorage.getItem(SAFETY_ESCALATION_STAGE_THREE_DELAY_KEY),
    AsyncStorage.getItem(SAFETY_ESCALATION_STAGE_ONE_MODE_KEY),
    AsyncStorage.getItem(SAFETY_ESCALATION_STAGE_TWO_MODE_KEY),
    AsyncStorage.getItem(SAFETY_ESCALATION_STAGE_THREE_MODE_KEY),
    AsyncStorage.getItem(SAFETY_ESCALATION_SECURE_ARRIVAL_ENABLED_KEY),
    AsyncStorage.getItem(SAFETY_ESCALATION_SECURE_ARRIVAL_REQUIRE_LOCATION_KEY),
    AsyncStorage.getItem(SAFETY_ESCALATION_SECURE_ARRIVAL_REQUIRE_CHARGING_KEY),
    AsyncStorage.getItem(SAFETY_ESCALATION_SECURE_ARRIVAL_MIN_TRIP_MINUTES_KEY)
  ]);

  const fallbackReminder = parsePositiveMinutes(
    reminderRaw,
    DEFAULT_SAFETY_ESCALATION_CONFIG.stageOneDelayMinutes
  );
  const fallbackClose = parsePositiveMinutes(
    closeContactsRaw,
    DEFAULT_SAFETY_ESCALATION_CONFIG.stageTwoDelayMinutes
  );

  return ensureValidConfig({
    enabled: enabledRaw !== "false",
    reminderDelayMinutes: fallbackReminder,
    closeContactsDelayMinutes: fallbackClose,
    stageOneDelayMinutes: parsePositiveMinutes(stageOneRaw, fallbackReminder),
    stageTwoDelayMinutes: parsePositiveMinutes(stageTwoRaw, fallbackClose),
    stageThreeDelayMinutes: parsePositiveMinutes(
      stageThreeRaw,
      DEFAULT_SAFETY_ESCALATION_CONFIG.stageThreeDelayMinutes
    ),
    stageOneMode: toMode(stageOneModeRaw, DEFAULT_SAFETY_ESCALATION_CONFIG.stageOneMode),
    stageTwoMode: toMode(stageTwoModeRaw, DEFAULT_SAFETY_ESCALATION_CONFIG.stageTwoMode),
    stageThreeMode: toMode(stageThreeModeRaw, DEFAULT_SAFETY_ESCALATION_CONFIG.stageThreeMode),
    secureArrivalEnabled: secureArrivalEnabledRaw === "true",
    secureArrivalRequireLocation: secureArrivalRequireLocationRaw !== "false",
    secureArrivalRequireCharging: secureArrivalRequireChargingRaw === "true",
    secureArrivalMinTripMinutes: parseNonNegativeMinutes(
      secureArrivalMinTripMinutesRaw,
      DEFAULT_SAFETY_ESCALATION_CONFIG.secureArrivalMinTripMinutes
    )
  });
}

export async function setSafetyEscalationConfig(config: SafetyEscalationConfig): Promise<void> {
  const normalized = ensureValidConfig(config);
  await Promise.all([
    AsyncStorage.setItem(SAFETY_ESCALATION_ENABLED_KEY, normalized.enabled ? "true" : "false"),
    // Anciennes clés conservées pour rétrocompatibilité.
    AsyncStorage.setItem(SAFETY_ESCALATION_REMINDER_KEY, String(normalized.stageOneDelayMinutes)),
    AsyncStorage.setItem(SAFETY_ESCALATION_CLOSE_CONTACTS_KEY, String(normalized.stageTwoDelayMinutes)),
    AsyncStorage.setItem(SAFETY_ESCALATION_STAGE_ONE_DELAY_KEY, String(normalized.stageOneDelayMinutes)),
    AsyncStorage.setItem(SAFETY_ESCALATION_STAGE_TWO_DELAY_KEY, String(normalized.stageTwoDelayMinutes)),
    AsyncStorage.setItem(SAFETY_ESCALATION_STAGE_THREE_DELAY_KEY, String(normalized.stageThreeDelayMinutes)),
    AsyncStorage.setItem(SAFETY_ESCALATION_STAGE_ONE_MODE_KEY, normalized.stageOneMode),
    AsyncStorage.setItem(SAFETY_ESCALATION_STAGE_TWO_MODE_KEY, normalized.stageTwoMode),
    AsyncStorage.setItem(SAFETY_ESCALATION_STAGE_THREE_MODE_KEY, normalized.stageThreeMode),
    AsyncStorage.setItem(
      SAFETY_ESCALATION_SECURE_ARRIVAL_ENABLED_KEY,
      normalized.secureArrivalEnabled ? "true" : "false"
    ),
    AsyncStorage.setItem(
      SAFETY_ESCALATION_SECURE_ARRIVAL_REQUIRE_LOCATION_KEY,
      normalized.secureArrivalRequireLocation ? "true" : "false"
    ),
    AsyncStorage.setItem(
      SAFETY_ESCALATION_SECURE_ARRIVAL_REQUIRE_CHARGING_KEY,
      normalized.secureArrivalRequireCharging ? "true" : "false"
    ),
    AsyncStorage.setItem(
      SAFETY_ESCALATION_SECURE_ARRIVAL_MIN_TRIP_MINUTES_KEY,
      String(normalized.secureArrivalMinTripMinutes)
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

  const stageOneAtMs = baseMs + params.config.stageOneDelayMinutes * 60 * 1000;
  const stageTwoAtMs = baseMs + params.config.stageTwoDelayMinutes * 60 * 1000;
  const stageThreeAtMs = baseMs + params.config.stageThreeDelayMinutes * 60 * 1000;

  return {
    baseAtIso: new Date(baseMs).toISOString(),
    reminderAtIso: new Date(stageOneAtMs).toISOString(),
    closeContactsAtIso: new Date(stageTwoAtMs).toISOString(),
    stageOneAtIso: new Date(stageOneAtMs).toISOString(),
    stageTwoAtIso: new Date(stageTwoAtMs).toISOString(),
    stageThreeAtIso: new Date(stageThreeAtMs).toISOString(),
    reminderDelaySeconds: Math.max(5, Math.round((stageOneAtMs - nowMs) / 1000)),
    closeContactsDelaySeconds: Math.max(5, Math.round((stageTwoAtMs - nowMs) / 1000)),
    stageOneDelaySeconds: Math.max(5, Math.round((stageOneAtMs - nowMs) / 1000)),
    stageTwoDelaySeconds: Math.max(5, Math.round((stageTwoAtMs - nowMs) / 1000)),
    stageThreeDelaySeconds: Math.max(5, Math.round((stageThreeAtMs - nowMs) / 1000))
  };
}

export function formatSafetyDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${m} min`;
}
