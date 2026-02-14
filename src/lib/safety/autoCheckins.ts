// Configuration et logique de détection pour les arrivées automatiques (mode "Snap").
import AsyncStorage from "@react-native-async-storage/async-storage";
import { distanceMeters } from "../trips/forgottenTrip";

const AUTO_CHECKIN_CONFIG_KEY = "safeback:auto_checkin_config";
const AUTO_CHECKIN_DETECTOR_STATE_KEY = "safeback:auto_checkin_detector_state";

export type AutoCheckinRule = {
  id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  cooldownMinutes: number;
  recipientUserIds: string[];
  trigger: {
    byPosition: boolean;
    byHomeWifi: boolean;
    byCharging: boolean;
    // Identifiant réseau "maison" best-effort basé sur le préfixe IPv4.
    homeWifiSsid?: string | null;
    homeWifiBssid?: string | null;
    homeWifiIpPrefix?: string | null;
  };
  enabled: boolean;
  createdAtIso: string;
  updatedAtIso: string;
};

export type AutoCheckinConfig = {
  enabled: boolean;
  rules: AutoCheckinRule[];
};

export type AutoCheckinDetectorState = {
  insideRuleIds: string[];
  eligibleRuleIds: string[];
  lastSentAtMsByRule: Record<string, number>;
};

export const DEFAULT_AUTO_CHECKIN_CONFIG: AutoCheckinConfig = {
  enabled: false,
  rules: []
};

export const DEFAULT_AUTO_CHECKIN_DETECTOR_STATE: AutoCheckinDetectorState = {
  insideRuleIds: [],
  eligibleRuleIds: [],
  lastSentAtMsByRule: {}
};

type CreateAutoCheckinRuleInput = {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  recipientUserIds: string[];
  trigger?: Partial<AutoCheckinRule["trigger"]>;
  radiusMeters?: number;
  cooldownMinutes?: number;
};

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeTrigger(
  trigger: Partial<AutoCheckinRule["trigger"]> | null | undefined
): AutoCheckinRule["trigger"] {
  const byPosition = typeof trigger?.byPosition === "boolean" ? trigger.byPosition : true;
  const byHomeWifi = typeof trigger?.byHomeWifi === "boolean" ? trigger.byHomeWifi : false;
  const byCharging = typeof trigger?.byCharging === "boolean" ? trigger.byCharging : false;
  const hasOneCondition = byPosition || byHomeWifi || byCharging;
  const homeWifiIpPrefix = extractIpv4Prefix(String(trigger?.homeWifiIpPrefix ?? ""));
  const homeWifiSsid = String(trigger?.homeWifiSsid ?? "").trim() || null;
  const homeWifiBssid = String(trigger?.homeWifiBssid ?? "").trim().toLowerCase() || null;
  return {
    byPosition: hasOneCondition ? byPosition : true,
    byHomeWifi,
    byCharging,
    homeWifiSsid,
    homeWifiBssid,
    homeWifiIpPrefix: homeWifiIpPrefix ?? null
  };
}

function normalizeRule(raw: Partial<AutoCheckinRule> | null | undefined): AutoCheckinRule | null {
  if (!raw) return null;
  const id = String(raw.id ?? "").trim();
  const label = String(raw.label ?? "").trim();
  const address = String(raw.address ?? "").trim();
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (!id || !label || !address || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const radiusRaw = Math.round(Number(raw.radiusMeters ?? 140));
  const cooldownRaw = Math.round(Number(raw.cooldownMinutes ?? 60));
  const recipientUserIds = Array.isArray(raw.recipientUserIds)
    ? [...new Set(raw.recipientUserIds.map((item) => String(item).trim()).filter(Boolean))]
    : [];
  const createdAtIso = String(raw.createdAtIso ?? new Date().toISOString());
  const updatedAtIso = String(raw.updatedAtIso ?? createdAtIso);

  return {
    id,
    label,
    address,
    latitude,
    longitude,
    radiusMeters: Math.max(40, Math.min(1200, radiusRaw)),
    cooldownMinutes: Math.max(1, Math.min(24 * 60, cooldownRaw)),
    recipientUserIds,
    trigger: normalizeTrigger(raw.trigger),
    enabled: Boolean(raw.enabled),
    createdAtIso,
    updatedAtIso
  };
}

function normalizeConfig(raw: Partial<AutoCheckinConfig> | null | undefined): AutoCheckinConfig {
  const enabled = typeof raw?.enabled === "boolean" ? raw.enabled : DEFAULT_AUTO_CHECKIN_CONFIG.enabled;
  const rules = Array.isArray(raw?.rules)
    ? raw.rules
        .map((item) => normalizeRule(item))
        .filter((item): item is AutoCheckinRule => Boolean(item))
        .sort((a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime())
    : [];
  return {
    enabled,
    rules
  };
}

function normalizeDetectorState(
  raw: Partial<AutoCheckinDetectorState> | null | undefined
): AutoCheckinDetectorState {
  const insideRuleIds = Array.isArray(raw?.insideRuleIds)
    ? [...new Set(raw.insideRuleIds.map((item) => String(item).trim()).filter(Boolean))]
    : [];
  const eligibleRuleIds = Array.isArray(raw?.eligibleRuleIds)
    ? [...new Set(raw.eligibleRuleIds.map((item) => String(item).trim()).filter(Boolean))]
    : insideRuleIds;
  const lastSentAtMsByRule = Object.fromEntries(
    Object.entries(raw?.lastSentAtMsByRule ?? {}).filter((entry) => Number.isFinite(Number(entry[1])))
  ) as Record<string, number>;
  return {
    insideRuleIds,
    eligibleRuleIds,
    lastSentAtMsByRule
  };
}

export async function getAutoCheckinConfig(): Promise<AutoCheckinConfig> {
  const raw = await AsyncStorage.getItem(AUTO_CHECKIN_CONFIG_KEY);
  if (!raw) return DEFAULT_AUTO_CHECKIN_CONFIG;
  try {
    return normalizeConfig(JSON.parse(raw) as Partial<AutoCheckinConfig>);
  } catch {
    return DEFAULT_AUTO_CHECKIN_CONFIG;
  }
}

export async function setAutoCheckinConfig(config: AutoCheckinConfig): Promise<AutoCheckinConfig> {
  const normalized = normalizeConfig(config);
  await AsyncStorage.setItem(AUTO_CHECKIN_CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function setAutoCheckinEnabled(enabled: boolean): Promise<AutoCheckinConfig> {
  const current = await getAutoCheckinConfig();
  return setAutoCheckinConfig({
    ...current,
    enabled
  });
}

export async function addAutoCheckinRule(input: CreateAutoCheckinRuleInput): Promise<AutoCheckinRule> {
  const nowIso = new Date().toISOString();
  const current = await getAutoCheckinConfig();
  const nextRule = normalizeRule({
    id: createId(),
    label: input.label.trim(),
    address: input.address.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    radiusMeters: input.radiusMeters ?? 140,
    cooldownMinutes: input.cooldownMinutes ?? 60,
    recipientUserIds: input.recipientUserIds,
    trigger: normalizeTrigger(input.trigger),
    enabled: true,
    createdAtIso: nowIso,
    updatedAtIso: nowIso
  });
  if (!nextRule) {
    throw new Error("Règle d'arrivée automatique invalide.");
  }

  await setAutoCheckinConfig({
    enabled: current.enabled,
    rules: [nextRule, ...current.rules]
  });
  return nextRule;
}

export async function deleteAutoCheckinRule(ruleId: string): Promise<void> {
  const current = await getAutoCheckinConfig();
  await setAutoCheckinConfig({
    ...current,
    rules: current.rules.filter((rule) => rule.id !== ruleId)
  });
}

export async function toggleAutoCheckinRule(ruleId: string, enabled: boolean): Promise<AutoCheckinConfig> {
  const current = await getAutoCheckinConfig();
  const nextRules = current.rules.map((rule) =>
    rule.id === ruleId
      ? {
          ...rule,
          enabled,
          updatedAtIso: new Date().toISOString()
        }
      : rule
  );
  return setAutoCheckinConfig({
    ...current,
    rules: nextRules
  });
}

export async function clearAutoCheckinConfig(): Promise<void> {
  await AsyncStorage.setItem(
    AUTO_CHECKIN_CONFIG_KEY,
    JSON.stringify({
      ...DEFAULT_AUTO_CHECKIN_CONFIG
    })
  );
}

export async function clearAutoCheckinDetectorState(): Promise<void> {
  await AsyncStorage.setItem(
    AUTO_CHECKIN_DETECTOR_STATE_KEY,
    JSON.stringify(DEFAULT_AUTO_CHECKIN_DETECTOR_STATE)
  );
}

export async function getAutoCheckinDetectorState(): Promise<AutoCheckinDetectorState> {
  const raw = await AsyncStorage.getItem(AUTO_CHECKIN_DETECTOR_STATE_KEY);
  if (!raw) return DEFAULT_AUTO_CHECKIN_DETECTOR_STATE;
  try {
    return normalizeDetectorState(JSON.parse(raw) as Partial<AutoCheckinDetectorState>);
  } catch {
    return DEFAULT_AUTO_CHECKIN_DETECTOR_STATE;
  }
}

export async function setAutoCheckinDetectorState(state: AutoCheckinDetectorState): Promise<void> {
  await AsyncStorage.setItem(
    AUTO_CHECKIN_DETECTOR_STATE_KEY,
    JSON.stringify(normalizeDetectorState(state))
  );
}

export type AutoCheckinEvaluationResult = {
  triggeredRules: AutoCheckinRule[];
  nextState: AutoCheckinDetectorState;
};

export function evaluateAutoCheckinArrivals(params: {
  coords: { latitude: number; longitude: number };
  rules: AutoCheckinRule[];
  state: AutoCheckinDetectorState;
  nowMs?: number;
}): AutoCheckinEvaluationResult {
  const nowMs = params.nowMs ?? Date.now();
  const previousInside = new Set(params.state.insideRuleIds);
  const nextInside = new Set<string>();
  const nextLastSent = { ...params.state.lastSentAtMsByRule };
  const triggeredRules: AutoCheckinRule[] = [];

  for (const rule of params.rules) {
    if (!rule.enabled || rule.recipientUserIds.length === 0) continue;

    const distance = distanceMeters(params.coords, {
      latitude: rule.latitude,
      longitude: rule.longitude
    });
    const inside = distance <= Math.max(40, rule.radiusMeters);
    if (inside) {
      nextInside.add(rule.id);
    }

    const wasInside = previousInside.has(rule.id);
    if (!inside || wasInside) continue;

    const cooldownMs = Math.max(1, rule.cooldownMinutes) * 60_000;
    const lastSentAtMs = Number(nextLastSent[rule.id] ?? 0);
    const cooldownPassed = !lastSentAtMs || nowMs - lastSentAtMs >= cooldownMs;
    if (!cooldownPassed) continue;

    triggeredRules.push(rule);
    nextLastSent[rule.id] = nowMs;
  }

  return {
    triggeredRules,
    nextState: {
      insideRuleIds: [...nextInside],
      eligibleRuleIds: [...nextInside],
      lastSentAtMsByRule: nextLastSent
    }
  };
}

export function extractIpv4Prefix(value: string): string | null {
  const trimmed = value.trim();
  const prefixMatch = trimmed.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (prefixMatch?.[1]) return prefixMatch[1];
  const fullIpMatch = trimmed.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (!fullIpMatch?.[1]) return null;
  return fullIpMatch[1];
}

export type AutoCheckinEvaluationContext = {
  coords?: { latitude: number; longitude: number } | null;
  isOnWifi?: boolean;
  wifiSsid?: string | null;
  wifiBssid?: string | null;
  wifiIpAddress?: string | null;
  isCharging?: boolean;
};

export function evaluateAutoCheckinRules(params: {
  rules: AutoCheckinRule[];
  state: AutoCheckinDetectorState;
  context: AutoCheckinEvaluationContext;
  nowMs?: number;
}): AutoCheckinEvaluationResult {
  const nowMs = params.nowMs ?? Date.now();
  const previousEligible = new Set(params.state.eligibleRuleIds);
  const nextEligible = new Set<string>();
  const nextInside = new Set<string>();
  const nextLastSent = { ...params.state.lastSentAtMsByRule };
  const triggeredRules: AutoCheckinRule[] = [];
  const currentWifiPrefix = extractIpv4Prefix(String(params.context.wifiIpAddress ?? ""));
  const currentWifiSsid = String(params.context.wifiSsid ?? "").trim();
  const currentWifiBssid = String(params.context.wifiBssid ?? "").trim().toLowerCase();

  for (const rule of params.rules) {
    if (!rule.enabled || rule.recipientUserIds.length === 0) continue;

    const positionMatch = (() => {
      if (!rule.trigger.byPosition) return true;
      if (!params.context.coords) return false;
      const dist = distanceMeters(params.context.coords, {
        latitude: rule.latitude,
        longitude: rule.longitude
      });
      const inside = dist <= Math.max(40, rule.radiusMeters);
      if (inside) nextInside.add(rule.id);
      return inside;
    })();

    const homeWifiMatch = (() => {
      if (!rule.trigger.byHomeWifi) return true;
      if (!params.context.isOnWifi) return false;
      const expectedSsid = String(rule.trigger.homeWifiSsid ?? "").trim();
      if (expectedSsid) {
        return expectedSsid.toLowerCase() === currentWifiSsid.toLowerCase();
      }
      const expectedBssid = String(rule.trigger.homeWifiBssid ?? "").trim().toLowerCase();
      if (expectedBssid) {
        return expectedBssid === currentWifiBssid;
      }
      const expectedPrefix = extractIpv4Prefix(String(rule.trigger.homeWifiIpPrefix ?? ""));
      if (expectedPrefix) {
        return expectedPrefix === currentWifiPrefix;
      }
      return false;
    })();

    const chargingMatch = (() => {
      if (!rule.trigger.byCharging) return true;
      return Boolean(params.context.isCharging);
    })();

    const eligibleNow = positionMatch && homeWifiMatch && chargingMatch;
    if (eligibleNow) {
      nextEligible.add(rule.id);
    }

    const wasEligible = previousEligible.has(rule.id);
    if (!eligibleNow || wasEligible) continue;

    const cooldownMs = Math.max(1, rule.cooldownMinutes) * 60_000;
    const lastSentAtMs = Number(nextLastSent[rule.id] ?? 0);
    const cooldownPassed = !lastSentAtMs || nowMs - lastSentAtMs >= cooldownMs;
    if (!cooldownPassed) continue;

    triggeredRules.push(rule);
    nextLastSent[rule.id] = nowMs;
  }

  return {
    triggeredRules,
    nextState: {
      insideRuleIds: [...nextInside],
      eligibleRuleIds: [...nextEligible],
      lastSentAtMsByRule: nextLastSent
    }
  };
}
