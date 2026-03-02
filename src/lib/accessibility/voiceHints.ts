// Annonces vocales accessibles (Voice Hints) pilotées par les préférences utilisateur.
import { AccessibilityInfo } from "react-native";
import { getAccessibilityPreferences } from "./preferences";

export async function announceVoiceHint(message: string): Promise<void> {
  const normalized = String(message ?? "").trim();
  if (!normalized) return;
  const prefs = await getAccessibilityPreferences();
  if (!prefs.voiceHintsEnabled) return;
  AccessibilityInfo.announceForAccessibility(normalized);
}
