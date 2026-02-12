import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams } from "expo-router";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker, Polyline } from "react-native-maps";
import { getSharedSessionSnapshot, type SharedSessionSnapshot } from "../src/lib/db";
import { normalizeSharedLocationPoints } from "../src/lib/liveShare";

function formatLastUpdate(value?: string | null) {
  if (!value) return "Aucune position recue";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Aucune position recue";
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export default function FriendViewScreen() {
  const { sessionId, shareToken } = useLocalSearchParams<{
    sessionId?: string;
    shareToken?: string;
  }>();
  const [snapshot, setSnapshot] = useState<SharedSessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const points = useMemo(
    () => normalizeSharedLocationPoints(snapshot?.points ?? []),
    [snapshot?.points]
  );
  const lastPoint = points.length > 0 ? points[points.length - 1] : null;
  const mapRegion = lastPoint
    ? {
        latitude: lastPoint.latitude,
        longitude: lastPoint.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02
      }
    : undefined;

  const fetchSnapshot = async (isRefresh = false) => {
    if (!sessionId || !shareToken) {
      setLoading(false);
      setErrorMessage("Lien invalide: parametres manquants.");
      return;
    }
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setErrorMessage("");
      const data = await getSharedSessionSnapshot({ sessionId, shareToken });
      if (!data) {
        setSnapshot(null);
        setErrorMessage("Partage indisponible ou desactive.");
      } else {
        setSnapshot(data);
      }
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible de charger la position partagee.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSnapshot(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, shareToken]);

  useEffect(() => {
    if (!sessionId || !shareToken) return;
    const interval = setInterval(() => {
      fetchSnapshot(true);
    }, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, shareToken]);

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchSnapshot(true)} />}
      >
        <Text className="mt-4 text-2xl font-bold text-black">Suivi proche</Text>
        <Text className="mt-2 text-sm text-slate-600">
          Vue partagee de la position en temps reel.
        </Text>

        <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs uppercase text-slate-500">Trajet</Text>
          <Text className="mt-2 text-sm font-semibold text-slate-900">
            {snapshot?.from_address ?? "Depart inconnu"}
          </Text>
          <Text className="mt-1 text-sm text-slate-700">vers {snapshot?.to_address ?? "Destination inconnue"}</Text>
          <Text className="mt-3 text-xs uppercase text-slate-500">Derniere position</Text>
          <Text className="mt-2 text-sm text-slate-700">
            {lastPoint
              ? `${lastPoint.latitude.toFixed(5)}, ${lastPoint.longitude.toFixed(5)}`
              : "En attente de donnees"}
          </Text>
          <Text className="mt-2 text-xs text-slate-500">
            Mise a jour: {formatLastUpdate(lastPoint?.recordedAt ?? null)}
          </Text>
        </View>

        <View className="mt-4 h-80 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {!mapRegion ? (
            <View className="flex-1 items-center justify-center px-6">
              <Text className="text-center text-sm text-slate-500">
                {loading ? "Chargement des donnees..." : "Aucune position disponible pour le moment."}
              </Text>
            </View>
          ) : (
            <MapView style={{ flex: 1 }} initialRegion={mapRegion}>
              {points.length > 1 ? (
                <Polyline
                  coordinates={points.map((point) => ({
                    latitude: point.latitude,
                    longitude: point.longitude
                  }))}
                  strokeWidth={4}
                  strokeColor="#111827"
                />
              ) : null}
              <Marker
                coordinate={{ latitude: mapRegion.latitude, longitude: mapRegion.longitude }}
                title="Position actuelle"
              />
            </MapView>
          )}
        </View>

        {errorMessage ? (
          <View className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <Text className="text-sm text-amber-800">{errorMessage}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

