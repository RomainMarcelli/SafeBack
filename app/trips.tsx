import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { deleteAllSessions, deleteSession, listSessions } from "../src/lib/db";
import { supabase } from "../src/lib/supabase";

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
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [query, setQuery] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);

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
        const data = await listSessions();
        setSessions(data as SessionItem[]);
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (!checking && !userId) {
    return null;
  }

  const filteredSessions = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return sessions;
    return sessions.filter((session) => {
      const from = String(session.from_address ?? "").toLowerCase();
      const to = String(session.to_address ?? "").toLowerCase();
      return from.includes(value) || to.includes(value);
    });
  }, [sessions, query]);

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
          Supprime les anciens trajets pour garder ta base propre.
        </Text>

        {loading ? (
          <Text className="mt-6 text-sm text-slate-500">Chargement...</Text>
        ) : sessions.length === 0 ? (
          <View className="mt-10 items-center justify-center rounded-3xl border border-[#E7E0D7] bg-white/90 p-6 shadow-sm">
            <Text className="text-base font-semibold text-slate-800">
              Aucun trajet pour l instant
            </Text>
            <Text className="mt-2 text-center text-sm text-slate-600">
              Tu veux en lancer un nouveau ?
            </Text>
            <View className="mt-5 w-full">
              <TouchableOpacity
                className="rounded-2xl bg-[#111827] px-4 py-3"
                onPress={() => router.replace("/setup")}
              >
                <Text className="text-center text-sm font-semibold text-white">
                  Creer un trajet
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                onPress={() => router.replace("/")}
              >
                <Text className="text-center text-sm font-semibold text-slate-700">
                  Retour accueil
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View className="mt-6">
            <TouchableOpacity
              className={`mb-4 rounded-2xl px-4 py-3 ${
                deletingAll ? "bg-slate-200" : "bg-rose-600"
              }`}
              onPress={() => {
                if (deletingAll) return;
                Alert.alert(
                  "Tout supprimer ?",
                  "Cette action est definitive.",
                  [
                    { text: "Annuler", style: "cancel" },
                    {
                      text: "Supprimer",
                      style: "destructive",
                      onPress: async () => {
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
                      }
                    }
                  ],
                  { cancelable: true }
                );
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
              <Text className="text-sm text-slate-600">Aucun trajet ne correspond.</Text>
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
                    <Text className="text-center text-sm font-semibold text-white">Relancer</Text>
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
                    <Text className="text-center text-sm font-semibold text-slate-700">
                      Suivre
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  onPress={async () => {
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
        )}

        {errorMessage ? (
          <Text className="mt-4 text-sm text-red-600">{errorMessage}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
