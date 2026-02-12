import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Linking, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { fetchRoute, type RouteMode, type RouteResult } from "../src/lib/routing";
import { getSessionById, setSessionLiveShare } from "../src/lib/db";
import { buildFriendViewLink, createLiveShareToken } from "../src/lib/liveShare";
import { supabase } from "../src/lib/supabase";
import { startBackgroundTracking, stopBackgroundTracking } from "../src/services/backgroundLocation";
import { getPremium } from "../src/lib/premium";

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

type SessionData = {
  id: string;
  from_address: string;
  to_address: string;
  expected_arrival_time?: string | null;
  share_token?: string | null;
  share_live?: boolean;
};

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
    if (!sessionId) return;
    (async () => {
      const data = await getSessionById(sessionId);
      if (data) {
        setSession({
          id: data.id,
          from_address: data.from_address,
          to_address: data.to_address,
          expected_arrival_time: data.expected_arrival_time ?? null,
          share_token: data.share_token ?? null,
          share_live: Boolean(data.share_live)
        });
      }
    })();
  }, [sessionId]);

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
    let subscription: Location.LocationSubscription | null = null;
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") return;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
        (position) => {
          setCoords({ lat: position.coords.latitude, lon: position.coords.longitude });
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

  if (!checking && !userId) {
    return null;
  }

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
            {routeResult ? `${routeResult.distanceKm} km` : "Donnees indisponibles"}
          </Text>
          <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">
            Heure d arrivee
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
          <Text className="text-xs uppercase tracking-widest text-slate-500">Position actuelle</Text>
          <Text className="mt-2 text-base font-semibold text-slate-800">
            {coords ? `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}` : "Recherche..."}
          </Text>
        </View>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">
            Suivi en arriere-plan
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
                  }
                  await startBackgroundTracking(session.id);
                  setBackgroundOn(true);
                } catch (error: any) {
                  setBgError(error?.message ?? "Impossible de demarrer le suivi.");
                }
              }}
              disabled={backgroundOn}
            >
              <Text
                className={`text-center text-sm font-semibold ${
                  backgroundOn ? "text-slate-600" : "text-white"
                }`}
              >
                Demarrer
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
              onPress={async () => {
                await stopBackgroundTracking();
                if (session?.id && liveSharingRequested) {
                  await setSessionLiveShare({ sessionId: session.id, enabled: false, shareToken: null });
                }
                setBackgroundOn(false);
                setArrivalMessage("Partage de position desactive manuellement.");
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
            onPress={async () => {
              if (arrivalConfirmed) return;
              try {
                if (autoDisableOnArrival && backgroundOn) {
                  await stopBackgroundTracking();
                  if (session?.id && liveSharingRequested) {
                    await setSessionLiveShare({
                      sessionId: session.id,
                      enabled: false,
                      shareToken: null
                    });
                  }
                  setBackgroundOn(false);
                  setArrivalMessage("Arrivee confirmee. Le partage de position a ete arrete.");
                } else if (autoDisableOnArrival) {
                  if (session?.id && liveSharingRequested) {
                    await setSessionLiveShare({
                      sessionId: session.id,
                      enabled: false,
                      shareToken: null
                    });
                  }
                  setArrivalMessage("Arrivee confirmee. Le partage etait deja inactif.");
                } else {
                  setArrivalMessage("Arrivee confirmee. Le partage reste actif jusqu a arret manuel.");
                }
                setArrivalConfirmed(true);
              } catch (error: any) {
                setBgError(error?.message ?? "Impossible de finaliser la confirmation d arrivee.");
              }
            }}
            disabled={arrivalConfirmed}
          >
            <Text
              className={`text-center text-sm font-semibold ${
                arrivalConfirmed ? "text-slate-600" : "text-white"
              }`}
            >
              {arrivalConfirmed ? "Arrivee confirmee" : "Je suis bien rentre"}
            </Text>
          </TouchableOpacity>
          {arrivalMessage ? (
            <Text className="mt-2 text-xs text-slate-500">{arrivalMessage}</Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
