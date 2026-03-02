// Gestion des appareils connectés: registre, heartbeat et révocation des autres sessions.
import Constants from "expo-constants";
import { supabase } from "../core/supabase";
import { getSensitiveString, setSensitiveString } from "../core/secureStorage";

const DEVICE_ID_KEY = "safeback:security:device-id:v1";

export type DeviceSession = {
  id: string;
  user_id: string;
  device_id: string;
  device_label: string;
  platform: string;
  app_version?: string | null;
  last_seen_at: string;
  revoked_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

function createDeviceId(): string {
  try {
    const globalCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
    if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  } catch {
    // no-op
  }
  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getOrCreateCurrentDeviceId(): Promise<string> {
  const existing = await getSensitiveString(DEVICE_ID_KEY);
  if (existing && existing.trim().length > 0) return existing;
  const created = createDeviceId();
  await setSensitiveString(DEVICE_ID_KEY, created);
  return created;
}

function getCurrentDeviceLabel(): string {
  const configuredName = String(Constants.deviceName ?? "").trim();
  if (configuredName.length > 0) return configuredName;
  if (getCurrentPlatform() === "ios") return "iPhone";
  if (getCurrentPlatform() === "android") return "Android";
  return "Appareil";
}

function getCurrentAppVersion(): string | null {
  const version = String(
    (Constants.expoConfig as { version?: string } | null | undefined)?.version ?? ""
  ).trim();
  return version.length > 0 ? version : null;
}

function getCurrentPlatform(): string {
  const platform = Constants.platform ?? {};
  if ("ios" in platform && platform.ios) return "ios";
  if ("android" in platform && platform.android) return "android";
  if ("web" in platform && platform.web) return "web";
  return "unknown";
}

export async function upsertCurrentDeviceSession(): Promise<DeviceSession | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return null;

  const deviceId = await getOrCreateCurrentDeviceId();
  const nowIso = new Date().toISOString();
  const payload = {
    user_id: userId,
    device_id: deviceId,
    device_label: getCurrentDeviceLabel(),
    platform: getCurrentPlatform(),
    app_version: getCurrentAppVersion(),
    last_seen_at: nowIso,
    revoked_at: null
  };
  const { data, error } = await supabase
    .from("user_device_sessions")
    .upsert(payload, { onConflict: "user_id,device_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as DeviceSession;
}

export async function listMyDeviceSessions(): Promise<DeviceSession[]> {
  const { data, error } = await supabase
    .from("user_device_sessions")
    .select("*")
    .order("last_seen_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DeviceSession[];
}

export async function disconnectOtherDevices(): Promise<number> {
  const deviceId = await getOrCreateCurrentDeviceId();
  const { data, error } = await supabase.rpc("revoke_other_device_sessions", {
    p_current_device_id: deviceId
  });
  if (error) throw error;
  const count = Number(data ?? 0);
  return Number.isFinite(count) ? count : 0;
}

export async function isCurrentDeviceRevoked(): Promise<boolean> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return false;

  const deviceId = await getOrCreateCurrentDeviceId();
  const { data, error } = await supabase
    .from("user_device_sessions")
    .select("revoked_at")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.revoked_at);
}
