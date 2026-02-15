// Écran historique des trajets avec timeline sécurité et score de fiabilité.
import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { deleteAllSessions, deleteSession, listSessions } from "../../src/lib/core/db";
import { listSecurityTimelineEvents, type SecurityTimelineEvent } from "../../src/lib/social/messagingDb";
import {
  getPersonalSafetyScore,
  type PersonalSafetyScore
} from "../../src/lib/trips/reliabilityScore";
import { filterTripSessionsByQuery, getTimelineBadge } from "../../src/lib/trips/tripsUi";
import { supabase } from "../../src/lib/core/supabase";
import { confirmAction, confirmSensitiveAction } from "../../src/lib/privacy/confirmAction";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";
import { PremiumEmptyState } from "../../src/components/ui/PremiumEmptyState";
import { SkeletonCard } from "../../src/components/ui/Skeleton";

type SessionItem = {
  id: string;
  from_address: string;
  to_address: string;
  created_at?: string;
};

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month} · ${hours}:${minutes}`;
}

export default function TripsScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [timeline, setTimeline] = useState<SecurityTimelineEvent[]>([]);
  const [reliability, setReliability] = useState<PersonalSafetyScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [query, setQuery] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);
  const [activePanel, setActivePanel] = useState<"timeline" | "sessions">("timeline");

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
    if (!userId) return;
    (async () => {
      try {
        setLoading(true);
        const [data, timelineEvents, reliabilityScore] = await Promise.all([
          listSessions(),
          listSecurityTimelineEvents(120),
          getPersonalSafetyScore()
        ]);
        setSessions(data as SessionItem[]);
        setTimeline(timelineEvents);
        setReliability(reliabilityScore);
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const shouldHideScreen = !checking && !userId;

  const filteredSessions = useMemo(() => {
    return filterTripSessionsByQuery(sessions, query);
  }, [sessions, query]);

  if (shouldHideScreen) {
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
          <View className="rounded-full bg-[#111827] px-3 py-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">
              Historique
            </Text>
          </View>
        </View>
        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Mes trajets</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Timeline sécurité et historique de tes trajets, sans te perdre dans les actions.
        </Text>

        <View className="mt-4 rounded-2xl border border-[#E7E0D7] bg-white/80 p-2">
          <View className="flex-row gap-2">
            <TouchableOpacity
              className={`flex-1 rounded-xl px-3 py-2 ${activePanel === "timeline" ? "bg-[#111827]" : "bg-white"}`}
              onPress={() => setActivePanel("timeline")}
            >
              <Text
                className={`text-center text-xs font-semibold uppercase tracking-wider ${
                  activePanel === "timeline" ? "text-white" : "text-slate-700"
                }`}
              >
                Timeline
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 rounded-xl px-3 py-2 ${activePanel === "sessions" ? "bg-[#111827]" : "bg-white"}`}
              onPress={() => setActivePanel("sessions")}
            >
              <Text
                className={`text-center text-xs font-semibold uppercase tracking-wider ${
                  activePanel === "sessions" ? "text-white" : "text-slate-700"
                }`}
              >
                Mes trajets
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {reliability ? (
          <View className="mt-6 rounded-3xl bg-[#111827] px-5 py-5 shadow-sm">
            <Text className="text-xs uppercase tracking-widest text-slate-300">Score fiabilite</Text>
            <Text className="mt-2 text-4xl font-extrabold text-white">{reliability.score}/100</Text>
            <Text className="mt-2 text-sm text-slate-300">
              Niveau:{" "}
              {reliability.level === "excellent"
                ? "Excellent"
                : reliability.level === "good"
                  ? "Bon"
                  : reliability.level === "fragile"
                    ? "Fragile"
                    : "Critique"}
            </Text>
            <Text className="mt-3 text-xs uppercase tracking-widest text-slate-400">
              Recommandations hebdomadaires
            </Text>
            {reliability.recommendations.slice(0, 3).map((item, index) => (
              <Text key={`reco-${index}`} className="mt-2 text-sm text-slate-200">
                - {item}
              </Text>
            ))}
            <View className="mt-4 rounded-2xl border border-slate-700 bg-slate-900 px-3 py-3">
              <Text className="text-[11px] uppercase tracking-widest text-slate-400">Tendance 7 jours</Text>
              <View className="mt-2 flex-row items-end justify-between">
                {reliability.weeklyTrend.map((point) => (
                  <View key={`trend-${point.dayLabel}`} className="items-center">
                    <View
                      className="w-6 rounded-t-md bg-sky-500"
                      style={{
                        height: Math.max(8, Math.round((point.score / 100) * 56))
                      }}
                    />
                    <Text className="mt-1 text-[10px] text-slate-400">{point.dayLabel}</Text>
                  </View>
                ))}
              </View>
              <Text className="mt-3 text-xs text-slate-300">
                Objectif: score ≥ {reliability.weeklyGoal.targetScore} pendant 5 jours.
              </Text>
              <Text className={`mt-1 text-xs font-semibold ${reliability.weeklyGoal.completed ? "text-emerald-400" : "text-amber-300"}`}>
                {reliability.weeklyGoal.daysMeetingTarget}/7 jour(s) au niveau cible
              </Text>
            </View>
          </View>
        ) : null}

        {activePanel === "timeline" ? (
          <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs uppercase tracking-widest text-slate-500">Timeline sécurité</Text>
              <TouchableOpacity onPress={() => setActivePanel("sessions")}>
                <Text className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Voir trajets
                </Text>
              </TouchableOpacity>
            </View>
            {loading ? (
              <View className="mt-3 gap-2">
                <SkeletonCard />
                <SkeletonCard />
              </View>
            ) : timeline.length === 0 ? (
              <View className="mt-3">
                <PremiumEmptyState
                  title="Timeline vide"
                  description="Aucun événement de sécurité pour le moment."
                  icon="time-outline"
                />
              </View>
            ) : (
              timeline.slice(0, 20).map((event) => {
                const style = getTimelineBadge(event.type);
                return (
                  <View
                    key={event.id}
                    className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm font-semibold text-slate-800">{event.title}</Text>
                      <View className={`rounded-full px-2 py-1 ${style.badgeClass}`}>
                        <Text className="text-[10px] font-semibold uppercase tracking-wider">
                          {style.badge}
                        </Text>
                      </View>
                    </View>
                    <Text className="mt-1 text-sm text-slate-600">{event.body}</Text>
                    <Text className="mt-2 text-xs text-slate-500">{formatDate(event.created_at)}</Text>
                  </View>
                );
              })
            )}
          </View>
        ) : null}

        {activePanel === "sessions" && loading ? (
          <View className="mt-6 gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : activePanel === "sessions" && sessions.length === 0 ? (
          <View className="mt-6">
            <PremiumEmptyState
              title="Aucun trajet pour l'instant"
              description="Lance ton premier trajet pour démarrer l'historique sécurité."
              icon="navigate-outline"
              actionLabel="Créer un trajet"
              onActionPress={() => router.replace("/setup")}
            />
            <TouchableOpacity
              className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
              onPress={() => router.replace("/")}
            >
              <Text className="text-center text-sm font-semibold text-slate-700">
                Retour accueil
              </Text>
            </TouchableOpacity>
          </View>
        ) : activePanel === "sessions" ? (
          <View className="mt-6">
            <TouchableOpacity
              className={`mb-4 rounded-2xl px-4 py-3 ${
                deletingAll ? "bg-slate-200" : "bg-rose-600"
              }`}
              onPress={async () => {
                if (deletingAll) return;
                const confirmed = await confirmSensitiveAction({
                  firstTitle: "Tout supprimer ?",
                  firstMessage: "Tu vas supprimer l'historique complet des trajets.",
                  secondTitle: "Confirmer la suppression totale",
                  secondMessage: "Cette action est définitive.",
                  secondConfirmLabel: "Supprimer tout"
                });
                if (!confirmed) return;
                try {
                  setDeletingAll(true);
                  await deleteAllSessions();
                  setSessions([]);
                  setQuery("");
                } catch (error: any) {
                  setErrorMessage(error?.message ?? "Erreur suppression.");
                } finally {
                  setDeletingAll(false);
                }
              }}
              disabled={deletingAll}
            >
              <Text className="text-center text-sm font-semibold text-white">
                Tout supprimer
              </Text>
            </TouchableOpacity>
            <TextInput
              className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
              placeholder="Rechercher un trajet"
              placeholderTextColor="#94a3b8"
              value={query}
              onChangeText={setQuery}
            />
            {filteredSessions.length === 0 ? (
              <PremiumEmptyState
                title="Aucun trajet trouvé"
                description="Essaie un autre mot-clé (départ, arrivée, date)."
                icon="search-outline"
              />
            ) : null}
            {filteredSessions.map((session) => (
              <View
                key={session.id}
                className="mt-3 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm"
              >
                <Text className="text-xs uppercase tracking-widest text-slate-500">
                  {formatDate(session.created_at)}
                </Text>
                <Text className="mt-3 text-sm font-semibold text-slate-800">Depart</Text>
                <Text className="text-sm text-slate-600">{session.from_address}</Text>
                <Text className="mt-3 text-sm font-semibold text-slate-800">Arrivee</Text>
                <Text className="text-sm text-slate-600">{session.to_address}</Text>
                <View className="mt-4 flex-row gap-2">
                  <TouchableOpacity
                    className="flex-1 rounded-2xl bg-[#111827] px-4 py-3"
                    onPress={() =>
                      router.push({
                        pathname: "/setup",
                        params: { from: session.from_address, to: session.to_address }
                      })
                    }
                  >
                    <View className="flex-row items-center justify-center">
                      <Ionicons name="repeat-outline" size={16} color="#fff" />
                      <Text className="ml-2 text-center text-sm font-semibold text-white">Relancer ce trajet</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                    onPress={() =>
                      router.push({
                        pathname: "/tracking",
                        params: { sessionId: session.id, mode: "walking" }
                      })
                    }
                  >
                    <View className="flex-row items-center justify-center">
                      <Ionicons name="map-outline" size={16} color="#334155" />
                      <Text className="ml-2 text-center text-sm font-semibold text-slate-700">Ouvrir le suivi</Text>
                    </View>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  onPress={async () => {
                    const confirmed = await confirmAction({
                      title: "Supprimer ce trajet ?",
                      message: "Cette suppression est définitive.",
                      confirmLabel: "Supprimer"
                    });
                    if (!confirmed) return;
                    try {
                      await deleteSession(session.id);
                      setSessions((prev) => prev.filter((item) => item.id !== session.id));
                    } catch (error: any) {
                      setErrorMessage(error?.message ?? "Erreur suppression.");
                    }
                  }}
                >
                  <Text className="text-center text-sm font-semibold text-slate-700">
                    Supprimer
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        {errorMessage ? <FeedbackMessage kind="error" message={errorMessage} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
