import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { Text, TouchableOpacity, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { deleteSession, listSessions } from "../src/lib/db";
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setChecking(false);
    });
  }, []);

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
    return <Redirect href="/auth" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <View className="mt-4 flex-row items-center">
          <TouchableOpacity
            className="mr-3 rounded-full border border-slate-200 px-3 py-2"
            onPress={() => router.back()}
          >
            <Text className="text-sm font-semibold text-slate-700">Retour</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-black">Mes trajets</Text>
        </View>
        <Text className="mt-2 text-sm text-slate-600">
          Supprime les anciens trajets pour garder ta base propre.
        </Text>

        {loading ? (
          <Text className="mt-6 text-sm text-slate-500">Chargement...</Text>
        ) : sessions.length === 0 ? (
          <View className="mt-12 items-center justify-center rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <Text className="text-base font-semibold text-slate-800">
              0 trajet realise
            </Text>
            <Text className="mt-2 text-center text-sm text-slate-600">
              Lance un trajet pour le voir apparaitre ici.
            </Text>
            <View className="mt-5 w-full">
              <TouchableOpacity
                className="rounded-xl bg-black px-4 py-3"
                onPress={() => router.replace("/setup")}
              >
                <Text className="text-center text-sm font-semibold text-white">
                  Creer un trajet
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="mt-3 rounded-xl border border-slate-200 px-4 py-3"
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
            {sessions.map((session) => (
              <View
                key={session.id}
                className="mt-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <Text className="text-xs uppercase text-slate-500">
                  {formatDate(session.created_at)}
                </Text>
                <Text className="mt-2 text-sm font-semibold text-slate-800">Depart</Text>
                <Text className="text-sm text-slate-600">{session.from_address}</Text>
                <Text className="mt-3 text-sm font-semibold text-slate-800">Arrivee</Text>
                <Text className="text-sm text-slate-600">{session.to_address}</Text>
                <TouchableOpacity
                  className="mt-4 rounded-xl border border-slate-200 px-4 py-3"
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
