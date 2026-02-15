import Constants from "expo-constants";
import { Platform } from "react-native";
import * as Location from "expo-location";
import { sendSosSignalToGuardians } from "../lib/social/messagingDb";
import { buildSosMessage } from "../lib/safety/sos";
import { supabase } from "../lib/core/supabase";

type VolumeSosOptions = {
  onInfo?: (message: string) => void;
  onError?: (error: unknown) => void;
};

function resolveAddressFromReverseGeocode(reverse: Location.LocationGeocodedAddress[]): string | null {
  const first = reverse[0];
  if (!first) return null;
  const value = [
    first.name,
    first.street,
    first.postalCode,
    first.city,
    first.region,
    first.country
  ]
    .map((part) => String(part ?? "").trim())
    .filter((part) => part.length > 0)
    .join(", ");
  return value.length > 0 ? value : null;
}

// Raccourci SOS matériel : 5 appuis volume+ rapides déclenchent un SOS aux garants actifs.
// Limitation: indisponible dans Expo Go (nécessite un dev build/custom client).
export async function startVolumeSosShortcut(options: VolumeSosOptions = {}): Promise<() => void> {
  const onInfo = options.onInfo ?? (() => {});
  const onError = options.onError ?? (() => {});

  if (Platform.OS === "web") {
    onInfo("indisponible sur web");
    return () => {};
  }
  if (Constants.appOwnership === "expo") {
    onInfo("indisponible dans Expo Go (dev build requis)");
    return () => {};
  }

  let destroyed = false;
  let sending = false;
  let cooldownUntilMs = 0;
  let pressTimestamps: number[] = [];
  let lastVolume: number | null = null;
  let listener: { remove?: () => void } | null = null;

  const triggerSos = async () => {
    if (sending || destroyed) return;
    sending = true;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) {
        onInfo("aucune session active, SOS volume ignoré");
        return;
      }

      let coords: { lat: number; lon: number } | null = null;
      let currentAddress: string | null = null;
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status === "granted") {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        coords = {
          lat: position.coords.latitude,
          lon: position.coords.longitude
        };
        try {
          const reverse = await Location.reverseGeocodeAsync({
            latitude: coords.lat,
            longitude: coords.lon
          });
          currentAddress = resolveAddressFromReverseGeocode(reverse);
        } catch {
          currentAddress = null;
        }
      }

      const body = buildSosMessage({
        currentAddress,
        coords: coords ? { lat: coords.lat, lon: coords.lon } : null
      });
      const result = await sendSosSignalToGuardians({ body });
      onInfo(`SOS envoyé à ${result.conversations} garant(s).`);
    } catch (error) {
      onError(error);
    } finally {
      sending = false;
    }
  };

  try {
    const volumeModule = await import("react-native-volume-manager");
    const volumeManager = volumeModule.VolumeManager;

    try {
      const current = await volumeManager.getVolume();
      if (typeof current?.volume === "number" && Number.isFinite(current.volume)) {
        lastVolume = current.volume;
      }
    } catch {
      lastVolume = null;
    }

    listener = volumeManager.addVolumeListener((value: { volume?: number }) => {
      if (destroyed) return;
      const nextVolume = Number(value?.volume);
      if (!Number.isFinite(nextVolume)) return;

      const isVolumeUpPress = lastVolume != null ? nextVolume > lastVolume + 0.009 : false;
      lastVolume = nextVolume;
      if (!isVolumeUpPress) return;

      const now = Date.now();
      pressTimestamps = [...pressTimestamps, now].filter((ts) => now - ts <= 5000);
      onInfo(`volume+ détecté (${pressTimestamps.length}/5)`);

      if (pressTimestamps.length >= 5 && now >= cooldownUntilMs) {
        pressTimestamps = [];
        cooldownUntilMs = now + 30000;
        onInfo("seuil atteint, déclenchement SOS");
        triggerSos().catch((error) => {
          onError(error);
        });
      }
    });

    onInfo("écoute volume SOS active");
  } catch (error) {
    onError(error);
  }

  return () => {
    destroyed = true;
    pressTimestamps = [];
    if (listener?.remove) {
      listener.remove();
    }
    listener = null;
  };
}

