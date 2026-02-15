// Service de fond léger : détecte l'arrivée dans des lieux configurés et notifie les proches choisis.
import * as Location from "expo-location";
import * as Battery from "expo-battery";
import {
  evaluateAutoCheckinRules,
  getAutoCheckinConfig,
  getAutoCheckinDetectorState,
  setAutoCheckinDetectorState,
  type AutoCheckinRule,
  type AutoCheckinDetectorState
} from "../lib/safety/autoCheckins";
import { sendAutoCheckinSignalToRecipients } from "../lib/social/messagingDb";
import { logPrivacyEvent } from "../lib/privacy/privacyCenter";
import { supabase } from "../lib/core/supabase";
import { getWifiIdentity } from "../lib/safety/wifiIdentity";

type StartOptions = {
  onInfo?: (message: string) => void;
};

export async function startAutoCheckinDetector(options?: StartOptions): Promise<() => void> {
  const session = await supabase.auth.getSession();
  if (!session.data.session?.user) {
    options?.onInfo?.("auto-checkin: utilisateur non connecté");
    return () => {};
  }

  let cachedRules: AutoCheckinRule[] = [];
  let detectorState: AutoCheckinDetectorState = await getAutoCheckinDetectorState();
  let lastConfigRefreshMs = 0;
  let locationPermissionGranted: boolean | null = null;
  let running = false;
  let cancelled = false;

  const loadRules = async (force = false): Promise<AutoCheckinRule[]> => {
    const nowMs = Date.now();
    if (!force && nowMs - lastConfigRefreshMs < 3 * 60_000) {
      return cachedRules;
    }
    const config = await getAutoCheckinConfig();
    cachedRules = config.enabled
      ? config.rules.filter((rule) => rule.enabled && rule.recipientUserIds.length > 0)
      : [];
    lastConfigRefreshMs = nowMs;
    options?.onInfo?.(`auto-checkin: ${cachedRules.length} règle(s) active(s)`);
    return cachedRules;
  };

  const runCycle = async () => {
    if (running || cancelled) return;
    running = true;
    try {
      const rules = await loadRules(false);
      if (rules.length === 0) return;

      const needsPosition = rules.some((rule) => rule.trigger.byPosition);
      const needsWifi = rules.some((rule) => rule.trigger.byHomeWifi);
      const needsCharging = rules.some((rule) => rule.trigger.byCharging);

      let coords: { latitude: number; longitude: number } | null = null;
      if (needsPosition) {
        if (locationPermissionGranted === null) {
          const permission = await Location.requestForegroundPermissionsAsync();
          locationPermissionGranted = permission.status === "granted";
          options?.onInfo?.(
            locationPermissionGranted
              ? "auto-checkin: permission localisation'accordée"
              : "auto-checkin: permission localisation refusée"
          );
        }
        if (locationPermissionGranted) {
          try {
            const position = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced
            });
            coords = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            };
          } catch {
            coords = null;
          }
        }
      }

      let isOnWifi = false;
      let wifiSsid: string | null = null;
      let wifiBssid: string | null = null;
      let wifiIpAddress: string | null = null;
      if (needsWifi) {
        try {
          const wifiIdentity = await getWifiIdentity();
          isOnWifi = wifiIdentity.isOnWifi;
          wifiSsid = wifiIdentity.ssid;
          wifiBssid = wifiIdentity.bssid;
          wifiIpAddress = wifiIdentity.ipAddress;
        } catch {
          isOnWifi = false;
          wifiSsid = null;
          wifiBssid = null;
          wifiIpAddress = null;
        }
      }

      let isCharging = false;
      if (needsCharging) {
        try {
          const batteryState = await Battery.getBatteryStateAsync();
          isCharging =
            batteryState === Battery.BatteryState.CHARGING ||
            batteryState === Battery.BatteryState.FULL;
        } catch {
          isCharging = false;
        }
      }

      const evaluation = evaluateAutoCheckinRules({
        rules,
        state: detectorState,
        context: {
          coords,
          isOnWifi,
          wifiSsid,
          wifiBssid,
          wifiIpAddress,
          isCharging
        }
      });
      detectorState = evaluation.nextState;
      await setAutoCheckinDetectorState(detectorState);

      for (const rule of evaluation.triggeredRules) {
        const sent = await sendAutoCheckinSignalToRecipients({
          recipientUserIds: rule.recipientUserIds,
          placeLabel: rule.label,
          placeAddress: rule.address,
          latitude: rule.latitude,
          longitude: rule.longitude
        });
          options?.onInfo?.(
          `auto-checkin: arrivée validée "${rule.label}" (${sent.conversations} contact(s) notifié(s))`
          );
        await logPrivacyEvent({
          type: "auto_checkin_arrival",
          message: `Arrivée automatique envoyée depuis ${rule.label}.`,
          data: {
            rule_id: rule.id,
            recipients: sent.conversations,
            checks: {
              by_position: rule.trigger.byPosition,
              by_home_wifi: rule.trigger.byHomeWifi,
              by_charging: rule.trigger.byCharging
            }
          }
        });
      }
    } catch (error: any) {
      options?.onInfo?.(`auto-checkin: erreur détecteur ${error?.message ?? "inconnue"}`);
    } finally {
      running = false;
    }
  };

  await loadRules(true);
  await runCycle();
  const interval = setInterval(runCycle, 25_000);

  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}
