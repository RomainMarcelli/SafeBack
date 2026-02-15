// Tableau de bord des proches: personnes suivies, statut réseau et actions rapides (co-pilote / ping).
import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../src/lib/core/supabase";
import { getPublicProfilesByUserIds, listFriends } from "../../src/lib/social/friendsDb";
import { listFriendMapPresence, getFriendOnlineState } from "../../src/lib/social/friendMap";
import {
  listGuardianAssignments,
  requestGuardianAssignment,
  sendFriendWellbeingPing
} from "../../src/lib/social/messagingDb";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";

type TrackedPersonRow = {
  userId: string;
  label: string;
  onlineState: "online" | "recently_offline" | "offline";
  lastPresenceAt?: string | null;
};

function formatDateTime(value?: string | null): string {
  if (!value) return "Aucun signal";
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month} ${hours}:${minutes}`;
}

function onlineLabel(state: "online" | "recently_offline" | "offline"): string {
  if (state === "online") return "En ligne";
  if (state === "recently_offline") return "Connexion récente";
  return "Hors ligne";
}

export default function GuardianDashboardScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [trackedRows, setTrackedRows] = useState<TrackedPersonRow[]>([]);
  const [guardianRows, setGuardianRows] = useState<Array<{ userId: string; label: string }>>([]);
  const [friendRows, setFriendRows] = useState<Array<{ userId: string; label: string }>>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

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

  useEffect(() => {
    if (!userId) return;

    (async () => {
      try {
        setLoading(true);
        setErrorMessage("");

        const [assignments, friends] = await Promise.all([listGuardianAssignments(), listFriends()]);

        const trackedIds = assignments
          .filter((row) => row.guardian_user_id === userId && row.status === "active")
          .map((row) => row.owner_user_id);
        const myGuardianIds = assignments
          .filter((row) => row.owner_user_id === userId && row.status === "active")
          .map((row) => row.guardian_user_id);

        const allProfileIds = [...new Set([...trackedIds, ...myGuardianIds, ...friends.map((f) => f.friend_user_id)])];
        const [profiles, presenceRows] = await Promise.all([
          getPublicProfilesByUserIds(allProfileIds),
          listFriendMapPresence(trackedIds)
        ]);

        const profileMap = new Map(profiles.map((row) => [row.user_id, row]));
        const presenceMap = new Map(presenceRows.map((row) => [row.user_id, row]));

        const formatLabel = (id: string) => {
          const profile = profileMap.get(id);
          const username = String(profile?.username ?? "").trim();
          const fullName = `${String(profile?.first_name ?? "").trim()} ${String(
            profile?.last_name ?? ""
          ).trim()}`.trim();
          if (username) return `@${username}`;
          if (fullName) return fullName;
          return profile?.public_id ? `ID ${profile.public_id}` : id.slice(0, 8);
        };

        setTrackedRows(
          trackedIds.map((id) => {
            const presence = presenceMap.get(id);
            return {
              userId: id,
              label: formatLabel(id),
              onlineState: getFriendOnlineState({
                network_connected: presence?.network_connected,
                updated_at: presence?.updated_at
              }),
              lastPresenceAt: presence?.updated_at ?? null
            };
          })
        );

        setGuardianRows(myGuardianIds.map((id) => ({ userId: id, label: formatLabel(id) })));
        setFriendRows(
          friends.map((friend) => ({
            userId: friend.friend_user_id,
            label: formatLabel(friend.friend_user_id)
          }))
        );
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Impossible de charger le tableau de bord proches.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const onlineCount = useMemo(
    () => trackedRows.filter((row) => row.onlineState === "online").length,
    [trackedRows]
  );
  const guardianIdsSet = useMemo(() => new Set(guardianRows.map((row) => row.userId)), [guardianRows]);
  const requestableFriends = useMemo(
    () => friendRows.filter((row) => !guardianIdsSet.has(row.userId)),
    [friendRows, guardianIdsSet]
  );

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="mt-6 flex-row items-center justify-between">
          <TouchableOpacity
            className="rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
            onPress={() => router.back()}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">Retour</Text>
          </TouchableOpacity>
          <View className="rounded-full bg-[#111827] px-3 py-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">Proches</Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Tableau de bord proches</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Vue dédiée des personnes suivies, statuts réseau et actions en un clic.
        </Text>

        <View className="mt-6 rounded-3xl bg-[#111827] px-5 py-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-300">Résumé</Text>
          <Text className="mt-2 text-2xl font-extrabold text-white">{trackedRows.length} suivie(s)</Text>
          <Text className="mt-1 text-sm text-slate-300">En ligne actuellement: {onlineCount}</Text>
          <Text className="mt-1 text-sm text-slate-300">Mes garants: {guardianRows.length}</Text>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Personnes suivies</Text>
          {loading ? (
            <View className="mt-3">
              <View className="h-4 w-48 rounded-full bg-slate-200" />
              <View className="mt-2 h-4 w-64 rounded-full bg-slate-200" />
              <View className="mt-2 h-4 w-40 rounded-full bg-slate-200" />
            </View>
          ) : trackedRows.length === 0 ? (
            <View className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
              <Text className="text-sm font-semibold text-amber-800">Aucune personne suivie pour l'instant.</Text>
              <Text className="mt-1 text-xs text-amber-700">
                Demande à un proche de te désigner comme garant dans Réseau proches.
              </Text>
            </View>
          ) : (
            trackedRows.map((row) => (
              <View key={row.userId} className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                <Text className="text-sm font-semibold text-slate-900">{row.label}</Text>
                <Text className="mt-1 text-xs text-slate-600">Statut réseau: {onlineLabel(row.onlineState)}</Text>
                <Text className="mt-1 text-xs text-slate-500">Dernier signal: {formatDateTime(row.lastPresenceAt)}</Text>

                <View className="mt-3 flex-row gap-2">
                  <TouchableOpacity
                    className="flex-1 rounded-2xl bg-cyan-700 px-3 py-3"
                    onPress={() =>
                      router.push({
                        pathname: "/live-companion",
                        params: { targetUserId: row.userId, targetName: row.label }
                      })
                    }
                  >
                    <Text className="text-center text-xs font-semibold text-white">Mode co-pilote</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className={`flex-1 rounded-2xl px-3 py-3 ${
                      busyUserId === row.userId ? "bg-slate-300" : "bg-emerald-600"
                    }`}
                    onPress={async () => {
                      try {
                        setBusyUserId(row.userId);
                        setErrorMessage("");
                        const result = await sendFriendWellbeingPing(row.userId);
                        if (result.status === "already_pending") {
                          setInfoMessage(`Une demande est déjà en'attente pour ${row.label}.`);
                        } else {
                          setInfoMessage(`Demande envoyée à ${row.label}.`);
                        }
                      } catch (error: any) {
                        setErrorMessage(error?.message ?? "Impossible d'envoyér la demande.");
                      } finally {
                        setBusyUserId(null);
                      }
                    }}
                    disabled={Boolean(busyUserId)}
                  >
                    <Text className="text-center text-xs font-semibold text-white">Demander "bien'arrivé ?"</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Mes garants</Text>
          {guardianRows.length === 0 ? (
            <Text className="mt-3 text-sm text-slate-500">Aucun garant actif.</Text>
          ) : (
            guardianRows.map((row) => (
              <View key={row.userId} className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <Text className="text-sm font-semibold text-slate-900">{row.label}</Text>
              </View>
            ))
          )}
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Demander un garant</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Envoie une demande rapide à un ami pour qu'il devienne ton garant.
          </Text>
          {requestableFriends.length === 0 ? (
            <Text className="mt-3 text-sm text-slate-500">Tous tes amis sont déjà garants.</Text>
          ) : (
            requestableFriends.map((row) => (
              <View key={`request-${row.userId}`} className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-slate-900">{row.label}</Text>
                  <TouchableOpacity
                    className={`rounded-xl px-3 py-2 ${busyUserId === row.userId ? "bg-slate-300" : "bg-[#111827]"}`}
                    onPress={async () => {
                      try {
                        setBusyUserId(row.userId);
                        setErrorMessage("");
                        const result = await requestGuardianAssignment(row.userId);
                        if (result.status === "already_guardian") {
                          setInfoMessage(`${row.label} est déjà ton garant.`);
                        } else if (result.status === "already_requested") {
                          setInfoMessage(`Une demande récente est déjà en attente pour ${row.label}.`);
                        } else if (result.status === "not_friend") {
                          setErrorMessage("La demande n'est disponible qu'entre amis.");
                        } else {
                          setInfoMessage(`Demande envoyée à ${row.label}.`);
                        }
                      } catch (error: any) {
                        setErrorMessage(error?.message ?? "Impossible d'envoyer la demande.");
                      } finally {
                        setBusyUserId(null);
                      }
                    }}
                    disabled={Boolean(busyUserId)}
                  >
                    <Text className="text-xs font-semibold uppercase tracking-widest text-white">Demander</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {errorMessage ? <FeedbackMessage kind="error" message={errorMessage} /> : null}
        {infoMessage ? <FeedbackMessage kind="info" message={infoMessage} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
