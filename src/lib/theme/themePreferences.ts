// Préférence de thème globale (clair/sombre) stockée localement.
import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_PREF_KEY = "safeback:theme-pref:v1";

export type ThemeMode = "light" | "dark";

export async function getThemeMode(): Promise<ThemeMode> {
  const raw = await AsyncStorage.getItem(THEME_PREF_KEY);
  return raw === "dark" ? "dark" : "light";
}

export async function setThemeMode(mode: ThemeMode): Promise<ThemeMode> {
  const normalized: ThemeMode = mode === "dark" ? "dark" : "light";
  await AsyncStorage.setItem(THEME_PREF_KEY, normalized);
  return normalized;
}

