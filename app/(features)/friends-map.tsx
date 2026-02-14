// Carte live des proches: partage optionnel, avatar emoji et statut en ligne/hors-ligne.
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import MapView, { Marker } from "react-native-maps";
import { ActivityIndicator, ScrollView, Switch, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getProfile, upsertProfile } from "../../src/lib/core/db";
import { listFriends, type FriendWithProfile } from "../../src/lib/social/friendsDb";
import {
  getFriendOnlineState,
  listFriendMapPresence,
  normalizeMarkerEmoji,
  upsertMyFriendMapPresence,
  type FriendMapPresence
} from "../../src/lib/social/friendMap";
import { confirmAction } from "../../src/lib/privacy/confirmAction";
import { supabase } from "../../src/lib/core/supabase";

const MARKER_OPTIONS = ["🧭", "🏠", "🚶", "🚗", "🚆", "🛡️", "🌟", "🫶", "📍", "🛰️"];

function profileLabel(friend: FriendWithProfile) {
  const username = String(friend.profile?.username ?? "").trim();
  if (username) return username;
  const fullName = `${String(friend.profile?.first_name ?? "").trim()} ${String(
    friend.profile?.last_name ?? ""
  ).trim()}`.trim();
  if (fullName) return fullName;
  return `ID ${friend.profile?.public_id ?? friend.friend_user_id.slice(0, 8)}`;
}

function formatSeenAt(value?: string | null): string {
  if (!value) return "jamais";
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month} ${hours}:${minutes}`;
}

export default function FriendsMapScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [shareEnabled, setShareEnabled] = useState(false);
  const [markerEmoji, setMarkerEmoji] = useState("🧭");
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [presenceRows, setPresenceRows] = useState<FriendMapPresence[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [profile, friendRows] = await Promise.all([getProfile(), listFriends()]);
    const selectedEmoji = normalizeMarkerEmoji(profile?.map_avatar ?? "🧭");
    setShareEnabled(Boolean(profile?.map_share_enabled));
    setMarkerEmoji(selectedEmoji);
    setFriends(friendRows);

    const userIds = [userId, ...friendRows.map((row) => row.friend_user_id)];
    const rows = await listFriendMapPresence(userIds);
    setPresenceRows(rows);
  }, [userId]);

  const pushMyPosition = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!userId) return;
      if (!shareEnabled && !opts?.force) return;

      const [Network, Location] = await Promise.all([import("expo-network"), import("expo-location")]);
      const network = await Network.getNetworkStateAsync();

      const permission = await Location.getForegroundPermissionsAsync();
      const shouldAsk = permission.status === "undetermined";
      const finalPermission = shouldAsk
        ? await Location.requestForegroundPermissionsAsync()
        : permission;

      if (finalPermission.status !== "granted") {
        await upsertMyFriendMapPresence({
          markerEmoji,
          networkConnected: Boolean(network.isConnected)
        });
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      await upsertMyFriendMapPresence({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? null,
        markerEmoji,
        networkConnected: Boolean(network.isConnected)
      });
    },
    [userId, shareEnabled, markerEmoji]
  );

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setLoading(true);
        setErrorMessage("");
        await refresh();
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Impossible de charger la carte des proches.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId || !shareEnabled) return;
    let cancelled = false;
    const timer = setInterval(() => {
      if (cancelled) return;
      pushMyPosition().catch(() => {
        // no-op: la prochaine boucle relancera la synchro de presence.
      });
    }, 45_000);

    pushMyPosition({ force: true }).catch(() => {
      // no-op initial.
    });

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userId, shareEnabled, pushMyPosition]);

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

  const friendPresenceMap = useMemo(() => {
    const map = new Map<string, FriendMapPresence>();
    for (const row of presenceRows) {
      map.set(row.user_id, row);
    }
    return map;
  }, [presenceRows]);

  const visibleFriends = useMemo(
    () =>
      friends
        .map((friend) => ({
          friend,
          presence: friendPresenceMap.get(friend.friend_user_id)
        }))
        .filter(
          (entry) =>
            typeof entry.presence?.latitude === "number" && typeof entry.presence?.longitude === "number"
        ),
    [friends, friendPresenceMap]
  );

  const myPresence = userId ? friendPresenceMap.get(userId) : undefined;

  const mapRegion = useMemo(() => {
    const first = visibleFriends[0]?.presence ?? myPresence;
    const lat = typeof first?.latitude === "number" ? first.latitude : 48.8566;
    const lng = typeof first?.longitude === "number" ? first.longitude : 2.3522;
    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.06,
      longitudeDelta: 0.06
    };
  }, [visibleFriends, myPresence]);

  const saveMapSettings = async (next: { shareEnabled?: boolean; markerEmoji?: string }) => {
    try {
      setSavingSettings(true);
      setErrorMessage("");
      setSuccessMessage("");

      const nextShare = next.shareEnabled ?? shareEnabled;
      const nextMarker = normalizeMarkerEmoji(next.markerEmoji ?? markerEmoji);

      await upsertProfile({
        map_share_enabled: nextShare,
        map_avatar: nextMarker
      });
      setShareEnabled(nextShare);
      setMarkerEmoji(nextMarker);

      if (nextShare) {
        await pushMyPosition({ force: true });
      }
      await refresh();
      setSuccessMessage(nextShare ? "Partage carte active." : "Partage carte desactive.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible de sauvegarder les preferences carte.");
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <View className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#C7DDF8] opacity-60" />
      <View className="absolute top-32 -left-28 h-72 w-72 rounded-full bg-[#BFE9D6] opacity-55" />

      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="mt-6 flex-row items-center justify-between">
          <TouchableOpacity
            className="rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
            onPress={() => router.back()}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">Retour</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
            onPress={() => router.push("/friends")}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">Reseau</Text>
          </TouchableOpacity>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Carte des proches</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Mode live: icone perso, presence en ligne/hors-ligne et partage opt-in.
        </Text>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/95 p-5 shadow-sm">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-xs uppercase tracking-widest text-slate-500">Visibilite carte</Text>
              <Text className="mt-1 text-sm text-slate-700">
                {shareEnabled
                  ? "Tu es visible par tes amis et ta position est synchronisee."
                  : "Tu es invisible: personne ne te voit sur la carte."}
              </Text>
            </View>
            <Switch
              value={shareEnabled}
              onValueChange={async (value) => {
                const confirmed = await confirmAction({
                  title: value ? "Activer la visibilite carte ?" : "Desactiver la visibilite carte ?",
                  message: value
                    ? "Tes amis verront ta position live et ton statut de connexion."
                    : "Tu disparaitras de la carte des proches.",
                  confirmLabel: value ? "Activer" : "Desactiver"
                });
                if (!confirmed) return;
                saveMapSettings({ shareEnabled: value }).catch(() => {
                  // no-op: message affiche via setErrorMessage.
                });
              }}
              disabled={savingSettings}
            />
          </View>

          <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">Mon icone live</Text>
          <View className="mt-2 flex-row flex-wrap">
            {MARKER_OPTIONS.map((emoji) => {
              const selected = markerEmoji === emoji;
              return (
                <TouchableOpacity
                  key={`emoji-${emoji}`}
                  className={`mr-2 mt-2 rounded-2xl border px-3 py-2 ${
                    selected ? "border-sky-500 bg-sky-50" : "border-slate-200 bg-white"
                  }`}
                  onPress={() => {
                    saveMapSettings({ markerEmoji: emoji }).catch(() => {
                      // no-op: message affiche via setErrorMessage.
                    });
                  }}
                  disabled={savingSettings}
                >
                  <Text className="text-xl">{emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            className={`mt-4 rounded-2xl px-4 py-3 ${shareEnabled ? "bg-[#0F766E]" : "bg-slate-300"}`}
            onPress={async () => {
              try {
                setRefreshing(true);
                setErrorMessage("");
                if (shareEnabled) {
                  await pushMyPosition({ force: true });
                }
                await refresh();
              } catch (error: any) {
                setErrorMessage(error?.message ?? "Impossible d'actualiser la carte.");
              } finally {
                setRefreshing(false);
              }
            }}
            disabled={refreshing || savingSettings}
          >
            <Text className="text-center text-sm font-semibold text-white">
              {refreshing ? "Actualisation..." : "Actualiser ma presence"}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 h-80 overflow-hidden rounded-3xl border border-[#E7E0D7] bg-white">
          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="small" color="#334155" />
              <Text className="mt-2 text-sm text-slate-600">Chargement de la carte...</Text>
            </View>
          ) : (
            <MapView style={{ flex: 1 }} initialRegion={mapRegion}>
              {visibleFriends.map(({ friend, presence }) => (
                <Marker
                  key={`friend-${friend.friend_user_id}`}
                  coordinate={{
                    latitude: Number(presence?.latitude),
                    longitude: Number(presence?.longitude)
                  }}
                  title={profileLabel(friend)}
                  description={
                    getFriendOnlineState({
                      network_connected: presence?.network_connected,
                      updated_at: presence?.updated_at
                    }) === "online"
                      ? "En ligne"
                      : "Hors ligne ou connexion instable"
                  }
                >
                  <View className="rounded-full border border-slate-200 bg-white px-2 py-1">
                    <Text style={{ fontSize: 20 }}>{normalizeMarkerEmoji(presence?.marker_emoji)}</Text>
                  </View>
                </Marker>
              ))}
              {shareEnabled && typeof myPresence?.latitude === "number" && typeof myPresence?.longitude === "number" ? (
                <Marker
                  coordinate={{
                    latitude: Number(myPresence.latitude),
                    longitude: Number(myPresence.longitude)
                  }}
                  title="Moi"
                  description="Ma position partagee"
                >
                  <View className="rounded-full border border-slate-200 bg-[#0F172A] px-2 py-1">
                    <Text style={{ fontSize: 20 }}>{markerEmoji}</Text>
                  </View>
                </Marker>
              ) : null}
            </MapView>
          )}
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/95 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Statut des proches</Text>
          {friends.length === 0 ? (
            <Text className="mt-3 text-sm text-slate-500">Aucun ami configure pour le moment.</Text>
          ) : (
            friends.map((friend) => {
              const presence = friendPresenceMap.get(friend.friend_user_id);
              const state = getFriendOnlineState({
                network_connected: presence?.network_connected,
                updated_at: presence?.updated_at
              });
              const tone =
                state === "online"
                  ? "bg-emerald-50 text-emerald-700"
                  : state === "recently_offline"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-slate-100 text-slate-700";
              const stateLabel =
                state === "online"
                  ? "En ligne"
                  : state === "recently_offline"
                    ? "Connexion recente"
                    : "Hors ligne";

              return (
                <View
                  key={`status-${friend.friend_user_id}`}
                  className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-slate-900">{profileLabel(friend)}</Text>
                    <View className={`rounded-full px-3 py-1 ${tone}`}>
                      <Text className="text-[11px] font-semibold uppercase tracking-wider">{stateLabel}</Text>
                    </View>
                  </View>
                  <Text className="mt-1 text-xs text-slate-500">
                    Derniere activite: {formatSeenAt(presence?.updated_at)}
                  </Text>
                  <Text className="mt-1 text-xs text-slate-500">
                    {typeof presence?.latitude === "number" && typeof presence?.longitude === "number"
                      ? "Position disponible sur la carte"
                      : "Position non partagee"}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {successMessage ? (
          <View className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <View className="flex-row items-center">
              <Ionicons name="checkmark-circle-outline" size={16} color="#047857" />
              <Text className="ml-2 text-sm text-emerald-700">{successMessage}</Text>
            </View>
          </View>
        ) : null}
        {errorMessage ? (
          <View className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
            <View className="flex-row items-center">
              <Ionicons name="warning-outline" size={16} color="#BE123C" />
              <Text className="ml-2 text-sm text-rose-700">{errorMessage}</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
