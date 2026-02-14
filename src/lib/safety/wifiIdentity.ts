// Résolution de l'identité Wi-Fi courante (SSID/BSSID/IP) avec fallback Expo.
import * as Network from "expo-network";
import WifiManager from "react-native-wifi-reborn";

export type WifiIdentity = {
  isOnWifi: boolean;
  ssid: string | null;
  bssid: string | null;
  ipAddress: string | null;
  ipPrefix: string | null;
};

function cleanWifiValue(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  if (lowered === "<unknown ssid>" || lowered === "unknown ssid") return null;
  if (lowered === "null" || lowered === "(null)") return null;
  return raw;
}

function extractIpv4Prefix(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  return match?.[1] ?? null;
}

export async function getWifiIdentity(): Promise<WifiIdentity> {
  const networkState = await Network.getNetworkStateAsync();
  const isOnWifi = networkState.type === Network.NetworkStateType.WIFI;
  if (!isOnWifi) {
    return {
      isOnWifi: false,
      ssid: null,
      bssid: null,
      ipAddress: null,
      ipPrefix: null
    };
  }

  let ssid: string | null = null;
  let bssid: string | null = null;
  try {
    ssid = cleanWifiValue(await WifiManager.getCurrentWifiSSID());
  } catch {
    ssid = null;
  }
  try {
    bssid = cleanWifiValue(await WifiManager.getBSSID());
  } catch {
    bssid = null;
  }

  let ipAddress: string | null = null;
  try {
    ipAddress = cleanWifiValue(await Network.getIpAddressAsync());
  } catch {
    ipAddress = null;
  }

  return {
    isOnWifi,
    ssid,
    bssid: bssid?.toLowerCase() ?? null,
    ipAddress,
    ipPrefix: extractIpv4Prefix(ipAddress)
  };
}

