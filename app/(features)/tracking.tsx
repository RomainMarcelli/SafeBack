import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Linking, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Battery from "expo-battery";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { fetchRoute, type RouteMode, type RouteResult } from "../../src/lib/trips/routing";
import { getSessionById, listSessionContacts, setSessionLiveShare } from "../../src/lib/core/db";
import { buildFriendViewLink, createLiveShareToken } from "../../src/lib/trips/liveShare";
import { supabase } from "../../src/lib/core/supabase";
import { startBackgroundTracking, stopBackgroundTracking } from "../../src/services/backgroundLocation";
import { getPremium } from "../../src/lib/subscription/premiumStorage";
import { buildSmsUrl, buildSosMessage } from "../../src/lib/safety/sos";
import { clearActiveSessionId, setActiveSessionId } from "../../src/lib/trips/activeSession";
import { syncSafeBackHomeWidget } from "../../src/lib/home/androidHomeWidget";
import {
  sendArrivalSignalToGuardians,
  sendLowBatterySignalToGuardians,
  sendSosSignalToGuardians
} from "../../src/lib/social/messagingDb";
import { getPredefinedMessageConfig, resolvePredefinedMessage } from "../../src/lib/contacts/predefinedMessage";
import { triggerAccessibleHaptic } from "../../src/lib/accessibility/feedback";
import { logPrivacyEvent } from "../../src/lib/privacy/privacyCenter";
import { getSafetyEscalationConfig, type SafetyEscalationConfig } from "../../src/lib/safety/safetyEscalation";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";

function formatTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDurationLabel(minutesTotal: number) {
  if (!Number.isFinite(minutesTotal)) return "";
  if (minutesTotal < 60) return `${minutesTotal} min`;
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

function batteryStateLabel(state: Battery.BatteryState | null): string {
  if (state == null) return "Inconnu";
  if (state === Battery.BatteryState.CHARGING) return "En charge";
  if (state === Battery.BatteryState.FULL) return "Chargé";
  if (state === Battery.BatteryState.UNPLUGGED) return "Sur batterie";
  return "Inconnu";
}

type SessionData = {
  id: string;
  from_address: string;
  to_address: string;
  created_at?: string | null;
  expected_arrival_time?: string | null;
  share_token?: string | null;
  share_live?: boolean;
};

type SessionContact = {
  id: string;
  name: string;
  phone?: string | null;
  channel?: "sms" | "whatsapp" | "call";
};

function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e293b" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0f172a" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] }
];

export default function TrackingScreen() {
  const router = useRouter();
  const { sessionId, mode, shareLiveLocation, autoDisableShareOnArrival, shareToken } = useLocalSearchParams<{
    sessionId?: string;
    mode?: RouteMode;
    shareLiveLocation?: string;
    autoDisableShareOnArrival?: string;
    shareToken?: string;
  }>();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [backgroundOn, setBackgroundOn] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const [autoStartAttempted, setAutoStartAttempted] = useState(false);
  const [arrivalConfirmed, setArrivalConfirmed] = useState(false);
  const [arrivalMessage, setArrivalMessage] = useState<string | null>(null);
  const [premium, setPremiumState] = useState(false);
  const [premiumChecked, setPremiumChecked] = useState(false);
  const [sessionContacts, setSessionContacts] = useState<SessionContact[]>([]);
  const [sosSending, setSosSending] = useState(false);
  const [sosError, setSosError] = useState<string | null>(null);
  const [sosInfo, setSosInfo] = useState<string | null>(null);
  const [batteryLevelPercent, setBatteryLevelPercent] = useState<number | null>(null);
  const [batteryState, setBatteryState] = useState<Battery.BatteryState | null>(null);
  const [lowBatteryAlertSent, setLowBatteryAlertSent] = useState(false);
  const [safetyConfig, setSafetyConfig] = useState<SafetyEscalationConfig | null>(null);
  const [speedMps, setSpeedMps] = useState<number | null>(null);
  const [stillSinceIso, setStillSinceIso] = useState<string | null>(null);
  const [showSmartCheckinCard, setShowSmartCheckinCard] = useState(false);
  const [smartCheckinSnoozeUntil, setSmartCheckinSnoozeUntil] = useState<number>(0);
  const hasGoogleKey = Boolean(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);

  const routeMode = useMemo<RouteMode>(() => mode ?? "walking", [mode]);
  const liveSharingRequested = useMemo(
    () => shareLiveLocation === "1" || shareLiveLocation === "true",
    [shareLiveLocation]
  );
  const autoDisableOnArrival = useMemo(
    () => !(autoDisableShareOnArrival === "0" || autoDisableShareOnArrival === "false"),
    [autoDisableShareOnArrival]
  );
  const activeShareToken = useMemo(
    () => (shareToken && String(shareToken).trim().length > 0 ? String(shareToken) : session?.share_token ?? null),
    [shareToken, session?.share_token]
  );
  const friendViewLink = useMemo(() => {
    if (!session?.id || !activeShareToken) return null;
    return buildFriendViewLink({ sessionId: session.id, shareToken: activeShareToken });
  }, [session?.id, activeShareToken]);

  const openInMaps = async () => {
    if (!session) return;
    const origin = encodeURIComponent(session.from_address);
    const destination = encodeURIComponent(session.to_address);
    const travelmode =
      routeMode === "walking" ? "walking" : routeMode === "driving" ? "driving" : "transit";
    await Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${travelmode}`
    );
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setChecking(false);
    });
  }, []);

  useEffect(() => {
    if (!checking && !userId) {
      router.replace("/auth");
    }
  }, [checking, userId, router]);

  useEffect(() => {
    (async () => {
      const value = await getPremium();
      setPremiumState(value);
      setPremiumChecked(true);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const config = await getSafetyEscalationConfig();
        setSafetyConfig(config);
      } catch {
        setSafetyConfig(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const data = await getSessionById(sessionId);
      if (data) {
        await setActiveSessionId(data.id);
        setSession({
          id: data.id,
          from_address: data.from_address,
          to_address: data.to_address,
          created_at: data.created_at ?? null,
          expected_arrival_time: data.expected_arrival_time ?? null,
          share_token: data.share_token ?? null,
          share_live: Boolean(data.share_live)
        });
      }
    })();
  }, [sessionId]);

  useEffect(() => {
    if (!session?.id) {
      setSessionContacts([]);
      return;
    }
    (async () => {
      try {
        const contacts = await listSessionContacts(session.id);
        setSessionContacts(contacts as SessionContact[]);
      } catch {
        setSessionContacts([]);
      }
    })();
  }, [session?.id]);

  useEffect(() => {
    setLowBatteryAlertSent(false);
  }, [session?.id]);

  useEffect(() => {
    if (!session) {
      setRouteResult(null);
      return;
    }
    if (routeMode === "transit" && !hasGoogleKey) {
      setRouteResult(null);
      return;
    }
    (async () => {
      try {
        setRouteLoading(true);
        const data = await fetchRoute(session.from_address, session.to_address, routeMode);
        setRouteResult(data);
      } catch {
        setRouteResult(null);
      } finally {
        setRouteLoading(false);
      }
    })();
  }, [session, routeMode, hasGoogleKey]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (!session?.id || arrivalConfirmed) return;

    const checkBattery = async () => {
      try {
        const level = await Battery.getBatteryLevelAsync();
        const state = await Battery.getBatteryStateAsync();
        setBatteryState(state);
        if (!Number.isFinite(level)) return;
        const percent = Math.round(level * 100);
        setBatteryLevelPercent(percent);

        if (percent <= 20 && !lowBatteryAlertSent) {
          const dispatch = await sendLowBatterySignalToGuardians({
            sessionId: session.id,
            batteryLevelPercent: percent
          });
          setLowBatteryAlertSent(true);
          if (dispatch.conversations > 0) {
            setArrivalMessage(
              `Batterie faible (${percent}%). ${dispatch.conversations} garant(s) prévenu(s).`
            );
          }
          await logPrivacyEvent({
            type: "battery_alert_shared",
            message: "Alerte batterie faible partagee avec les garants.",
            data: {
              session_id: session.id,
              battery_level_percent: percent,
              guardians_notified: dispatch.conversations
            }
          });
        }
      } catch {
        // no-op : les API batterie sont en mode best-effort uniquement.
      }
    };

    checkBattery();
    interval = setInterval(checkBattery, 60000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [session?.id, arrivalConfirmed, lowBatteryAlertSent]);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") return;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
        (position) => {
          setCoords({ lat: position.coords.latitude, lon: position.coords.longitude });
          setSpeedMps(
            typeof position.coords.speed === "number" && Number.isFinite(position.coords.speed)
              ? Math.max(0, position.coords.speed)
              : null
          );
        }
      );
    })();
    return () => {
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (!liveSharingRequested || !session?.id || backgroundOn || arrivalConfirmed || autoStartAttempted) {
      return;
    }
    (async () => {
      try {
        setAutoStartAttempted(true);
        setBgError(null);
        const token = activeShareToken ?? createLiveShareToken();
        await setSessionLiveShare({
          sessionId: session.id,
          enabled: true,
          shareToken: token
        });
        await logPrivacyEvent({
          type: "share_enabled",
          message: "Partage live active depuis l'écran de suivi.",
          data: {
            session_id: session.id
          }
        });
        await startBackgroundTracking(session.id);
        setBackgroundOn(true);
      } catch (error: any) {
        setBgError(error?.message ?? "Impossible d activer le partage de position.");
      }
    })();
  }, [
    liveSharingRequested,
    session?.id,
    backgroundOn,
    arrivalConfirmed,
    autoStartAttempted,
    activeShareToken
  ]);

  const destinationCoord = routeResult?.coords?.length
    ? {
        lat: routeResult.coords[routeResult.coords.length - 1].latitude,
        lon: routeResult.coords[routeResult.coords.length - 1].longitude
      }
    : null;
  const tripDurationMinutes = useMemo(() => {
    if (!session?.created_at) return null;
    const startedAt = new Date(session.created_at).getTime();
    if (!Number.isFinite(startedAt)) return null;
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs <= 0) return 0;
    return Math.round(elapsedMs / 60000);
  }, [session?.created_at]);
  const nearDestination = useMemo(() => {
    if (!coords || !destinationCoord) return false;
    return distanceMeters(coords, destinationCoord) <= 280;
  }, [coords, destinationCoord]);
  const isCharging = useMemo(() => {
    return (
      batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL
    );
  }, [batteryState]);

  const handleConfirmArrival = async (source: "main_button" | "smart_card") => {
    if (arrivalConfirmed) return;
    try {
      // Vérifie les critères de preuve d'arrivée avant toute confirmation définitive.
      if (safetyConfig?.secureArrivalEnabled) {
        const proofErrors: string[] = [];
        if (safetyConfig.secureArrivalRequireLocation) {
          if (!coords || !destinationCoord || distanceMeters(coords, destinationCoord) > 280) {
            proofErrors.push("position proche de l'arrivée non détectée");
          }
        }
        if (safetyConfig.secureArrivalRequireCharging) {
          const chargingStates = [Battery.BatteryState.CHARGING, Battery.BatteryState.FULL];
          if (!batteryState || !chargingStates.includes(batteryState)) {
            proofErrors.push("téléphone non branché");
          }
        }
        if (
          safetyConfig.secureArrivalMinTripMinutes > 0 &&
          (tripDurationMinutes == null || tripDurationMinutes < safetyConfig.secureArrivalMinTripMinutes)
        ) {
          proofErrors.push(
            `durée minimale (${safetyConfig.secureArrivalMinTripMinutes} min) non'atteinte`
          );
        }
        if (proofErrors.length > 0) {
          setBgError(`Preuve d'arrivée incomplète: ${proofErrors.join(" · ")}.`);
          return;
        }
      }

      let arrivalNotice = "";
      if (autoDisableOnArrival && backgroundOn) {
        await stopBackgroundTracking();
        if (session?.id && liveSharingRequested) {
          await setSessionLiveShare({
            sessionId: session.id,
            enabled: false,
            shareToken: null
          });
          await logPrivacyEvent({
            type: "share_disabled",
            message: "Partage live désactivé à l'arrivée.",
            data: {
              session_id: session.id
            }
          });
        }
        setBackgroundOn(false);
        arrivalNotice = "Arrivée confirmée. Le partage de position'a été arrêté.";
      } else if (autoDisableOnArrival) {
        if (session?.id && liveSharingRequested) {
          await setSessionLiveShare({
            sessionId: session.id,
            enabled: false,
            shareToken: null
          });
          await logPrivacyEvent({
            type: "share_disabled",
            message: "Partage live confirmé inactif à l'arrivée.",
            data: {
              session_id: session.id
            }
          });
        }
        arrivalNotice = "Arrivée confirmée. Le partage était déjà inactif.";
      } else {
        arrivalNotice = "Arrivée confirmée. Le partage reste actif jusqu'à arrêt manuel.";
      }

      try {
        const predefinedConfig = await getPredefinedMessageConfig();
        const arrivalBody = resolvePredefinedMessage(predefinedConfig);
        const result = await sendArrivalSignalToGuardians({ note: arrivalBody });
        if (result.conversations > 0) {
          arrivalNotice += ` ${result.conversations} proche(s) notifié(s) via la messagerie.`;
        }
      } catch {
        arrivalNotice += " Notification proches indisponible.";
      }

      await logPrivacyEvent({
        type: "share_disabled",
        message:
          source === "smart_card"
            ? "Confirmation d'arrivée validée depuis la carte intelligente."
            : "Confirmation d'arrivée validée depuis le bouton principal.",
        data: {
          session_id: session?.id ?? null
        }
      });
      await triggerAccessibleHaptic("success");
      await clearActiveSessionId();
      try {
        await syncSafeBackHomeWidget({
          status: "arrived",
          note: "Confirmation envoyée",
          updatedAtIso: new Date().toISOString()
        });
      } catch {
        // no-op : la synchro du widget ne doit pas bloquer la confirmation d'arrivée.
      }
      setArrivalConfirmed(true);
      setShowSmartCheckinCard(false);
      setArrivalMessage(arrivalNotice);
    } catch (error: any) {
      setBgError(error?.message ?? "Impossible de finaliser la confirmation d'arrivée.");
    }
  };

  // Déclenche la carte de check-in intelligent après un'arrêt près de l'arrivée.
  useEffect(() => {
    if (arrivalConfirmed || !coords || !destinationCoord) {
      setShowSmartCheckinCard(false);
      setStillSinceIso(null);
      return;
    }

    if (Date.now() < smartCheckinSnoozeUntil) return;

    const nearArrivalPoint = distanceMeters(coords, destinationCoord) <= 250;
    const slowEnough = (speedMps ?? 0) <= 1.2;
    if (!nearArrivalPoint || !slowEnough) {
      setStillSinceIso(null);
      setShowSmartCheckinCard(false);
      return;
    }

    if (!stillSinceIso) {
      setStillSinceIso(new Date().toISOString());
      return;
    }

    const stillMs = Date.now() - new Date(stillSinceIso).getTime();
    if (stillMs >= 45_000) {
      setShowSmartCheckinCard(true);
    }
  }, [
    arrivalConfirmed,
    coords,
    destinationCoord,
    speedMps,
    stillSinceIso,
    smartCheckinSnoozeUntil
  ]);

  const handleSosLongPress = async () => {
    if (!session?.id) return;
    try {
      setSosSending(true);
      setSosError(null);
      setSosInfo(null);

      let latestCoords = coords;
      let currentAddress: string | null = null;
      if (!latestCoords) {
        try {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.status === "granted") {
            const position = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced
            });
            latestCoords = {
              lat: position.coords.latitude,
              lon: position.coords.longitude
            };
            setCoords(latestCoords);
          }
        } catch {
          // Garde un message de secours si la position reste inconnue dans le SOS.
        }
      }
      if (latestCoords) {
        try {
          const reverse = await Location.reverseGeocodeAsync({
            latitude: latestCoords.lat,
            longitude: latestCoords.lon
          });
          const first = reverse[0];
          if (first) {
            currentAddress = [
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
          }
        } catch {
          currentAddress = null;
        }
      }

      let contacts = sessionContacts;
      if (contacts.length === 0) {
        contacts = (await listSessionContacts(session.id)) as SessionContact[];
        setSessionContacts(contacts);
      }

      const recipients = contacts
        .map((contact) => String(contact.phone ?? "").trim())
        .filter((phone) => phone.length > 0);
      if (recipients.length === 0) {
        throw new Error("Aucun proche avec numero de telephone dans ce trajet.");
      }

      const body = buildSosMessage({
        fromAddress: session.from_address,
        toAddress: session.to_address,
        currentAddress,
        coords: latestCoords ? { lat: latestCoords.lat, lon: latestCoords.lon } : null
      });
      const smsUrl = buildSmsUrl({
        phones: recipients,
        body,
        platform: Platform.OS === "ios" ? "ios" : "android"
      });
      if (!smsUrl) {
        throw new Error("Impossible de generer le message SOS.");
      }

      const canOpen = await Linking.canOpenURL(smsUrl);
      if (!canOpen) {
        throw new Error("Impossible d ouvrir l'application SMS sur cet appareil.");
      }

      await Linking.openURL(smsUrl);
      let guardianConversations = 0;
      try {
        const guardianResult = await sendSosSignalToGuardians({
          sessionId: session.id,
          body
        });
        guardianConversations = guardianResult.conversations;
      } catch {
        guardianConversations = 0;
      }
      if (guardianConversations > 0) {
        setSosInfo(
          `Alerte SOS prete pour ${recipients.length} proche(s). ${guardianConversations} garant(s) notifie(s) dans l'app. Vérifie puis envoie.`
        );
      } else {
        setSosInfo(`Alerte SOS prete pour ${recipients.length} proche(s). Vérifie puis envoie.`);
      }
    } catch (error: any) {
      setSosError(error?.message ?? "Echec de preparation de l alerte SOS.");
    } finally {
      setSosSending(false);
    }
  };

  const region = routeResult?.coords?.[0]
    ? {
        latitude: routeResult.coords[0].latitude,
        longitude: routeResult.coords[0].longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02
      }
    : coords
    ? {
        latitude: coords.lat,
        longitude: coords.lon,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02
      }
    : undefined;

  if (!checking && !userId) {
    return null;
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <View className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#FAD4A6] opacity-70" />
      <View className="absolute top-32 -left-28 h-72 w-72 rounded-full bg-[#BFE9D6] opacity-60" />
      <View className="absolute bottom-24 -right-32 h-72 w-72 rounded-full bg-[#C7DDF8] opacity-40" />

      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        <View className="mt-6 flex-row items-center justify-between">
          <TouchableOpacity
            className="rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
            onPress={() => router.back()}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">
              Retour
            </Text>
          </TouchableOpacity>
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              className="rounded-full border border-[#E7E0D7] bg-white/90 px-3 py-2"
              onPress={openInMaps}
            >
              <Text className="text-[10px] font-semibold uppercase tracking-[2px] text-slate-700">
                Maps
              </Text>
            </TouchableOpacity>
            <View className="rounded-full bg-[#111827] px-3 py-1">
              <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">
                Suivi
              </Text>
            </View>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">
          Suivi du trajet
        </Text>
        <Text className="mt-2 text-base text-[#475569]">
          Les infos clefs du trajet, en temps reel.
        </Text>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Temps estime</Text>
          <Text className="mt-3 text-2xl font-extrabold text-[#0F172A]">
            {routeLoading
              ? "Calcul..."
              : routeResult
              ? formatDurationLabel(routeResult.durationMinutes)
              : routeMode === "transit" && !hasGoogleKey
              ? "Transit"
              : "Non dispo"}
          </Text>
          <Text className="mt-1 text-sm text-slate-600">
            {routeResult ? `${routeResult.distanceKm} km` : "Données indisponibles"}
          </Text>
          <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">
            Heure d arrivée
          </Text>
          <Text className="mt-2 text-base font-semibold text-slate-800">
            {formatTime(session?.expected_arrival_time) || "Non renseignee"}
          </Text>
        </View>

        <View className="mt-6 overflow-hidden rounded-3xl border border-[#E7E0D7] bg-white/90 shadow-sm">
          <View className="px-5 pt-5">
            <Text className="text-xs uppercase tracking-widest text-slate-500">Carte</Text>
            <Text className="mt-2 text-lg font-bold text-[#0F172A]">
              Suivi en direct
            </Text>
          </View>
          <View className="mt-4 h-72 overflow-hidden">
            {!premiumChecked ? (
              <View className="flex-1 items-center justify-center">
                <Text className="text-sm text-slate-500">Chargement...</Text>
              </View>
            ) : !premium ? (
              <TouchableOpacity
                className="flex-1 items-center justify-center"
                onPress={() => router.push("/premium")}
              >
                <Text className="text-sm font-semibold text-slate-700">🔒 Carte Premium</Text>
                <Text className="mt-2 text-xs text-slate-500">
                  Debloque la carte temps reel et le trajet.
                </Text>
              </TouchableOpacity>
            ) : region ? (
              <MapView
                style={{ flex: 1 }}
                initialRegion={region}
                showsUserLocation
                provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
                customMapStyle={Platform.OS === "android" ? darkMapStyle : undefined}
                onPress={() => {
                  if (!session) return;
                  const encodedFrom = encodeURIComponent(session.from_address);
                  const encodedTo = encodeURIComponent(session.to_address);
                  const url =
                    Platform.OS === "ios"
                      ? `http://maps.apple.com/?saddr=${encodedFrom}&daddr=${encodedTo}`
                      : `https://www.google.com/maps/dir/?api=1&origin=${encodedFrom}&destination=${encodedTo}`;
                  Linking.openURL(url);
                }}
              >
                {routeResult?.coords?.length ? (
                  <Polyline coordinates={routeResult.coords} strokeWidth={4} strokeColor="#111" />
                ) : null}
                {routeResult?.coords?.[0] ? (
                  <Marker coordinate={routeResult.coords[0]} title="Depart" />
                ) : null}
                {routeResult?.coords?.length ? (
                  <Marker
                    coordinate={routeResult.coords[routeResult.coords.length - 1]}
                    title="Arrivee"
                  />
                ) : null}
              </MapView>
            ) : (
              <View className="flex-1 items-center justify-center">
                <Text className="text-sm text-slate-500">Chargement de la carte...</Text>
              </View>
            )}
          </View>
        </View>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Position'actuelle</Text>
          <Text className="mt-2 text-base font-semibold text-slate-800">
            {coords ? `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}` : "Recherche..."}
          </Text>
          <Text className="mt-3 text-xs uppercase tracking-widest text-slate-500">Batterie</Text>
          <Text className="mt-2 text-base font-semibold text-slate-800">
            {batteryLevelPercent == null ? "Inconnue" : `${batteryLevelPercent}%`}
          </Text>
          <Text className="mt-1 text-xs text-slate-600">État: {batteryStateLabel(batteryState)}</Text>
          {batteryLevelPercent != null && batteryLevelPercent <= 20 ? (
            <Text className="mt-2 text-xs text-rose-700">
              Batterie faible: alerte proactive possible vers les garants.
            </Text>
          ) : null}
        </View>

        {safetyConfig?.secureArrivalEnabled ? (
          <View className="mt-4 rounded-3xl border border-cyan-200 bg-cyan-50/90 p-5 shadow-sm">
            <Text className="text-xs uppercase tracking-widest text-cyan-700">
              Preuve d'arrivée sécurisée
            </Text>
            <Text className="mt-2 text-sm text-cyan-900">
              La confirmation d'arrivée vérifiera les critères ci-dessous.
            </Text>
            {safetyConfig.secureArrivalRequireLocation ? (
              <Text className="mt-2 text-xs text-cyan-800">
                Position proche arrivée: {nearDestination ? "OK" : "En'attente"}
              </Text>
            ) : null}
            {safetyConfig.secureArrivalRequireCharging ? (
              <Text className="mt-1 text-xs text-cyan-800">
                Téléphone en charge: {isCharging ? "OK" : "En'attente"}
              </Text>
            ) : null}
            {safetyConfig.secureArrivalMinTripMinutes > 0 ? (
              <Text className="mt-1 text-xs text-cyan-800">
                Durée mini {safetyConfig.secureArrivalMinTripMinutes} min:{" "}
                {tripDurationMinutes != null &&
                tripDurationMinutes >= safetyConfig.secureArrivalMinTripMinutes
                  ? "OK"
                  : "En'attente"}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View className="mt-6 rounded-3xl border border-rose-200 bg-rose-50/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-rose-700">SOS discret</Text>
          <Text className="mt-2 text-sm text-rose-900">
            Appui long (2 sec) pour preparer un SMS d alerte avec ta position'aux proches du trajet.
          </Text>
          <Text className="mt-2 text-xs text-rose-700">
            {sessionContacts.length} proche(s) lie(s) a ce trajet.
          </Text>

          <TouchableOpacity
            className={`mt-4 flex-row items-center justify-center rounded-2xl px-4 py-4 ${
              sosSending ? "bg-rose-200" : "bg-rose-600"
            }`}
            delayLongPress={2000}
            onLongPress={handleSosLongPress}
            onPress={() => {
              if (!sosSending) {
                setSosInfo("Maintiens le bouton 2 secondes pour declencher le SOS.");
                setSosError(null);
              }
            }}
            disabled={sosSending}
          >
            <Ionicons name="warning-outline" size={18} color={sosSending ? "#9f1239" : "#ffffff"} />
            <Text
              className={`ml-2 text-sm font-semibold ${
                sosSending ? "text-rose-900" : "text-white"
              }`}
            >
              {sosSending ? "Preparation..." : "Maintenir pour SOS"}
            </Text>
          </TouchableOpacity>

          {sosError ? <FeedbackMessage kind="error" message={sosError} compact /> : null}
          {sosInfo ? <FeedbackMessage kind="error" message={sosInfo} compact /> : null}
          <TouchableOpacity
            className="mt-3 rounded-2xl border border-rose-200 bg-white px-4 py-3"
            onPress={() => {
              if (!session) return;
              const draftBody = buildSosMessage({
                fromAddress: session.from_address,
                toAddress: session.to_address,
                currentAddress: null,
                coords: coords ? { lat: coords.lat, lon: coords.lon } : null
              });
              router.push({
                pathname: "/incident-report",
                params: {
                  sessionId: session.id,
                  from: session.from_address,
                  to: session.to_address,
                  lat: coords ? String(coords.lat) : undefined,
                  lon: coords ? String(coords.lon) : undefined,
                  details: draftBody
                }
              });
            }}
            disabled={!session}
          >
            <Text className="text-center text-sm font-semibold text-rose-800">
              Rédiger un rapport incident
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">
            Suivi en'arriere-plan
          </Text>
          {bgError ? (
            <Text className="mt-2 text-sm text-amber-600">{bgError}</Text>
          ) : (
            <Text className="mt-2 text-sm text-slate-600">
              Envoi automatique des positions pendant le trajet.
            </Text>
          )}
          {liveSharingRequested && friendViewLink ? (
            <View className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Text className="text-xs uppercase text-slate-500">Lien vue proche</Text>
              <Text className="mt-2 text-xs text-slate-700">{friendViewLink}</Text>
              <View className="mt-3 flex-row gap-2">
                <TouchableOpacity
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2"
                  onPress={async () => {
                    // await Share.share({
                    //   message: `Suivi de trajet SafeBack: ${friendViewLink}`
                    // });
                  }}
                >
                  <Text className="text-center text-xs font-semibold text-slate-700">Partager</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2"
                  onPress={() =>
                    router.push({
                      pathname: "/friend-view",
                      params: {
                        sessionId: session?.id,
                        shareToken: activeShareToken ?? undefined
                      }
                    })
                  }
                >
                  <Text className="text-center text-xs font-semibold text-slate-700">
                    Ouvrir la vue
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          <View className="mt-4 flex-row gap-3">
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-4 py-3 ${
                backgroundOn ? "bg-slate-200" : "bg-[#111827]"
              }`}
              onPress={async () => {
                if (!session?.id) return;
                try {
                  setBgError(null);
                  if (liveSharingRequested) {
                    await setSessionLiveShare({
                      sessionId: session.id,
                      enabled: true,
                      shareToken: activeShareToken ?? createLiveShareToken()
                    });
                    await logPrivacyEvent({
                      type: "share_enabled",
                      message: "Partage live active manuellement.",
                      data: {
                        session_id: session.id
                      }
                    });
                  }
                  await startBackgroundTracking(session.id);
                  setBackgroundOn(true);
                } catch (error: any) {
                  setBgError(error?.message ?? "Impossible de démarrer le suivi.");
                }
              }}
              disabled={backgroundOn}
            >
              <Text
                className={`text-center text-sm font-semibold ${
                  backgroundOn ? "text-slate-600" : "text-white"
                }`}
              >
                Démarrer
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
              onPress={async () => {
                await stopBackgroundTracking();
                if (session?.id && liveSharingRequested) {
                  await setSessionLiveShare({ sessionId: session.id, enabled: false, shareToken: null });
                  await logPrivacyEvent({
                    type: "share_disabled",
                    message: "Partage live désactive manuellement.",
                    data: {
                      session_id: session.id
                    }
                  });
                }
                setBackgroundOn(false);
                setArrivalMessage("Partage de position désactive manuellement.");
              }}
            >
              <Text className="text-center text-sm font-semibold text-slate-700">
                Arreter
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            className={`mt-3 rounded-2xl px-4 py-3 ${
              arrivalConfirmed ? "bg-slate-200" : "bg-emerald-600"
            }`}
            onPress={() => handleConfirmArrival("main_button")}
            disabled={arrivalConfirmed}
          >
            <Text
              className={`text-center text-sm font-semibold ${
                arrivalConfirmed ? "text-slate-600" : "text-white"
              }`}
            >
              {arrivalConfirmed ? "Arrivee confirmee" : "Je suis bien rentré"}
            </Text>
          </TouchableOpacity>
          {arrivalMessage ? (
            <Text className="mt-2 text-xs text-slate-500">{arrivalMessage}</Text>
          ) : null}
        </View>
      </ScrollView>

      {showSmartCheckinCard && !arrivalConfirmed ? (
        <View className="absolute bottom-6 left-4 right-4 rounded-3xl border border-emerald-200 bg-white/95 px-4 py-4 shadow-lg">
          <Text className="text-[11px] font-semibold uppercase tracking-[2px] text-emerald-700">
            Check-in intelligent
          </Text>
          <Text className="mt-2 text-base font-bold text-slate-900">Tu sembles arrivé(e)</Text>
          <Text className="mt-1 text-sm text-slate-600">
            On détecte un'arrêt proche de l&apos;arrivée. Tu veux confirmer rapidement ?
          </Text>
          <View className="mt-3 flex-row gap-2">
            <TouchableOpacity
              className="flex-1 rounded-2xl bg-emerald-600 px-3 py-3"
              onPress={() => handleConfirmArrival("smart_card")}
            >
              <Text className="text-center text-xs font-semibold text-white">Oui, bien'arrivé</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3"
              onPress={() => {
                setShowSmartCheckinCard(false);
                setSmartCheckinSnoozeUntil(Date.now() + 5 * 60 * 1000);
              }}
            >
              <Text className="text-center text-xs font-semibold text-slate-700">Encore en trajet</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3"
            onPress={() => router.push("/quick-sos")}
          >
            <Text className="text-center text-xs font-semibold text-rose-700">Besoin d&apos;aide</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
