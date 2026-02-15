// Preferences d'accessibilite (lisibilite, contraste, retour haptique, commandes vocales).
import AsyncStorage from "@react-native-async-storage/async-storage";

const ACCESSIBILITY_PREFS_KEY = "safeback:accessibility-prefs:v1";

export type TextScale = "normal" | "large";

export type AccessibilityPreferences = {
  highContrast: boolean;
  textScale: TextScale;
  hapticsEnabled: boolean;
  voiceCommandsEnabled: boolean;
  voiceHintsEnabled: boolean;
  blindModeEnabled: boolean;
  deafModeEnabled: boolean;
};

export const DEFAULT_ACCESSIBILITY_PREFERENCES: AccessibilityPreferences = {
  highContrast: false,
  textScale: "normal",
  hapticsEnabled: true,
  voiceCommandsEnabled: false,
  voiceHintsEnabled: true,
  blindModeEnabled: false,
  deafModeEnabled: false
};

const preferenceListeners = new Set<(prefs: AccessibilityPreferences) => void>();

function emitPreferences(next: AccessibilityPreferences) {
  for (const listener of preferenceListeners) {
    listener(next);
  }
}

function normalize(value: unknown): AccessibilityPreferences {
  if (!value || typeof value !== "object") return DEFAULT_ACCESSIBILITY_PREFERENCES;
  const raw = value as Partial<AccessibilityPreferences>;
  return {
    highContrast: Boolean(raw.highContrast),
    textScale: raw.textScale === "large" ? "large" : "normal",
    hapticsEnabled: typeof raw.hapticsEnabled === "boolean" ? raw.hapticsEnabled : true,
    voiceCommandsEnabled: Boolean(raw.voiceCommandsEnabled),
    voiceHintsEnabled:
      typeof raw.voiceHintsEnabled === "boolean" ? raw.voiceHintsEnabled : true,
    blindModeEnabled: Boolean(raw.blindModeEnabled),
    deafModeEnabled: Boolean(raw.deafModeEnabled)
  };
}

export async function getAccessibilityPreferences(): Promise<AccessibilityPreferences> {
  const raw = await AsyncStorage.getItem(ACCESSIBILITY_PREFS_KEY);
  if (!raw) return DEFAULT_ACCESSIBILITY_PREFERENCES;
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return DEFAULT_ACCESSIBILITY_PREFERENCES;
  }
}

export async function setAccessibilityPreferences(
  patch: Partial<AccessibilityPreferences>
): Promise<AccessibilityPreferences> {
  const current = await getAccessibilityPreferences();
  const next = normalize({ ...current, ...patch });
  await AsyncStorage.setItem(ACCESSIBILITY_PREFS_KEY, JSON.stringify(next));
  emitPreferences(next);
  return next;
}

export async function resetAccessibilityPreferences(): Promise<AccessibilityPreferences> {
  await AsyncStorage.removeItem(ACCESSIBILITY_PREFS_KEY);
  emitPreferences(DEFAULT_ACCESSIBILITY_PREFERENCES);
  return DEFAULT_ACCESSIBILITY_PREFERENCES;
}

export function subscribeAccessibilityPreferences(
  listener: (prefs: AccessibilityPreferences) => void
): () => void {
  preferenceListeners.add(listener);
  return () => {
    preferenceListeners.delete(listener);
  };
}
