// Stockage local de l'identifiant de session'active pour coordonner les écrans et services.
import AsyncStorage from "@react-native-async-storage/async-storage";

const ACTIVE_SESSION_KEY = "safeback:active_session_id";

export async function getActiveSessionId(): Promise<string | null> {
  const value = await AsyncStorage.getItem(ACTIVE_SESSION_KEY);
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function setActiveSessionId(sessionId: string): Promise<void> {
  const trimmed = sessionId.trim();
  if (!trimmed) return;
  await AsyncStorage.setItem(ACTIVE_SESSION_KEY, trimmed);
}

export async function clearActiveSessionId(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
}
