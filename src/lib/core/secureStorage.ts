// Stockage local sensible: utilise SecureStore quand disponible, avec fallback AsyncStorage.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const SECURESTORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: "safeback",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
};

const FALLBACK_PREFIX = "safeback:secure-fallback:";

function fallbackKey(key: string): string {
  return `${FALLBACK_PREFIX}${key}`;
}

async function getSecureItem(key: string): Promise<string | null> {
  let secureValue: string | null = null;
  let secureStoreAvailable = true;
  try {
    secureValue = await SecureStore.getItemAsync(key, SECURESTORE_OPTIONS);
  } catch {
    secureStoreAvailable = false;
  }
  if (secureValue !== null) return secureValue;

  const fallback = await AsyncStorage.getItem(fallbackKey(key));
  if (fallback !== null) return fallback;

  // Migration douce des anciennes clés non préfixées déjà présentes sur certains appareils.
  const legacy = await AsyncStorage.getItem(key);
  if (legacy !== null) {
    if (secureStoreAvailable) {
      try {
        await SecureStore.setItemAsync(key, legacy, SECURESTORE_OPTIONS);
      } catch {
        await AsyncStorage.setItem(fallbackKey(key), legacy);
      }
    } else {
      await AsyncStorage.setItem(fallbackKey(key), legacy);
    }
    await AsyncStorage.removeItem(key);
  }
  return legacy;
}

async function setSecureItem(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value, SECURESTORE_OPTIONS);
    await AsyncStorage.removeItem(fallbackKey(key));
    await AsyncStorage.removeItem(key);
  } catch {
    await AsyncStorage.setItem(fallbackKey(key), value);
  }
}

async function removeSecureItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key, SECURESTORE_OPTIONS);
  } finally {
    await AsyncStorage.removeItem(fallbackKey(key));
    await AsyncStorage.removeItem(key);
  }
}

// Adaptateur compatible Supabase Auth storage.
export const secureAuthStorage = {
  getItem: getSecureItem,
  setItem: setSecureItem,
  removeItem: removeSecureItem
};

export async function getSensitiveJson<T>(key: string, fallbackValue: T): Promise<T> {
  const raw = await getSecureItem(key);
  if (!raw) return fallbackValue;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallbackValue;
  }
}

export async function setSensitiveJson<T>(key: string, value: T): Promise<void> {
  await setSecureItem(key, JSON.stringify(value));
}

export async function clearSensitiveKey(key: string): Promise<void> {
  await removeSecureItem(key);
}

export async function getSensitiveString(key: string): Promise<string | null> {
  return getSecureItem(key);
}

export async function setSensitiveString(key: string, value: string): Promise<void> {
  await setSecureItem(key, value);
}
