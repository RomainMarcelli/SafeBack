// Retour haptique léger basé sur la vibration native, piloté par les préférences utilisateur.
import { Vibration } from "react-native";
import { getAccessibilityPreferences } from "./preferences";

export async function triggerAccessibleHaptic(pattern: "light" | "success" | "warning" = "light") {
  const prefs = await getAccessibilityPreferences();
  if (!prefs.hapticsEnabled) return;

  if (pattern === "success") {
    Vibration.vibrate([0, 20, 20, 20]);
    return;
  }
  if (pattern === "warning") {
    Vibration.vibrate([0, 40, 25, 40]);
    return;
  }
  Vibration.vibrate(15);
}
