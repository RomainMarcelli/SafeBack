import * as Location from "expo-location";
import Constants from "expo-constants";
import { listFavoriteAddresses } from "../lib/db";
import { getActiveSessionId } from "../lib/activeSession";
import {
  detectForgottenTrip,
  type ForgottenTripConfig,
  type ForgottenTripDetectionState,
  type PreferredPlace
} from "../lib/forgottenTrip";
import {
  getForgottenTripConfig,
  resolvePreferredPlacesFromFavorites
} from "../lib/forgottenTripStorage";
import { supabase } from "../lib/supabase";

type StartOptions = {
  onInfo?: (message: string) => void;
};

export async function startForgottenTripDetector(options?: StartOptions): Promise<() => void> {
  const session = await supabase.auth.getSession();
  if (!session.data.session?.user) {
    return () => {};
  }

  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    options?.onInfo?.("forgotten-trip: location permission denied");
    return () => {};
  }

  let detectionState: ForgottenTripDetectionState = {
    insidePlaceId: null,
    lastAlertAtMs: null
  };
  let cachedConfig: ForgottenTripConfig | null = null;
  let cachedPlaces: PreferredPlace[] = [];
  let lastRefreshMs = 0;
  let notificationsAllowed: boolean | null = null;

  const loadPlaces = async (force = false): Promise<PreferredPlace[]> => {
    const now = Date.now();
    if (!force && now - lastRefreshMs < 3 * 60_000) {
      return cachedPlaces;
    }

    const config = await getForgottenTripConfig();
    cachedConfig = config;
    if (!config.enabled) {
      cachedPlaces = [];
      lastRefreshMs = now;
      return [];
    }

    const favorites = await listFavoriteAddresses();
    cachedPlaces = await resolvePreferredPlacesFromFavorites({
      favorites,
      config
    });
    lastRefreshMs = now;
    options?.onInfo?.(`forgotten-trip: ${cachedPlaces.length} preferred places loaded`);
    return cachedPlaces;
  };

  const ensureNotificationPermission = async (): Promise<boolean> => {
    if (Constants.appOwnership === "expo") {
      notificationsAllowed = false;
      return false;
    }
    if (notificationsAllowed !== null) return notificationsAllowed;
    const Notifications = await import("expo-notifications");
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      notificationsAllowed = true;
      return true;
    }
    if (!current.canAskAgain) {
      notificationsAllowed = false;
      return false;
    }
    const requested = await Notifications.requestPermissionsAsync();
    notificationsAllowed = requested.granted;
    return notificationsAllowed;
  };

  const sendForgottenTripNotification = async (placeLabel: string) => {
    const granted = await ensureNotificationPermission();
    if (!granted) return;
    const Notifications = await import("expo-notifications");
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Trajet oublie ?",
        body: `Vous avez quitte ${placeLabel}. Lancez un trajet SafeBack ?`
      },
      trigger: null
    });
  };

  await loadPlaces(true);

  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 20_000,
      distanceInterval: 30
    },
    async (position) => {
      try {
        const places = await loadPlaces(false);
        const config = cachedConfig ?? (await getForgottenTripConfig());
        if (!config.enabled || places.length === 0) return;

        const activeSessionId = await getActiveSessionId();
        const result = detectForgottenTrip({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          },
          places,
          config,
          state: detectionState,
          hasActiveSession: Boolean(activeSessionId)
        });
        detectionState = result.nextState;

        if (result.shouldNotify && result.placeLabel) {
          await sendForgottenTripNotification(result.placeLabel);
          options?.onInfo?.(`forgotten-trip: notification for ${result.placeLabel}`);
        }
      } catch (error: any) {
        options?.onInfo?.(
          `forgotten-trip: detector error ${error?.message ?? "unknown"}`
        );
      }
    }
  );

  return () => {
    subscription.remove();
  };
}
