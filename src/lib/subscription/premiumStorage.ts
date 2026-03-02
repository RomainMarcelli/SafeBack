// Fonctions de lecture/écriture de l'état premium et des avantages associés.
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREMIUM_KEY = "safeback:premium";

export async function getPremium(): Promise<boolean> {
  const value = await AsyncStorage.getItem(PREMIUM_KEY);
  return value === "true";
}

export async function setPremium(value: boolean): Promise<void> {
  await AsyncStorage.setItem(PREMIUM_KEY, value ? "true" : "false");
}
