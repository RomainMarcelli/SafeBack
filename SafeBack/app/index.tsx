import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Link, useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../src/lib/supabase";
import { listContacts, listFavoriteAddresses, listSessions } from "../src/lib/db";

type SessionItem = {
  id: string;
  from_address: string;
  to_address: string;
  created_at?: string;
};

export default function HomeScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [stats, setStats] = useState({ addresses: 0, contacts: 0, trips: 0 });
  const [lastSession, setLastSession] = useState<SessionItem | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
    if (!checking && !userId) {
      router.replace("/auth");
    }
  }, [checking, userId, router]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setLoadingData(true);
        setErrorMessage("");
        const [addresses, contacts, sessions] = await Promise.all([
          listFavoriteAddresses(),
          listContacts(),
          listSessions()
        ]);
        setStats({
          addresses: addresses.length,
          contacts: contacts.length,
          trips: sessions.length
        });
        setLastSession((sessions[0] ?? null) as SessionItem | null);
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement.");
      } finally {
        setLoadingData(false);
      }
    })();
  }, [userId]);

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
          <View className="rounded-full bg-[#111827] px-3 py-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">
              SafeBack
            </Text>
          </View>
          <Link href="/account" asChild>
            <TouchableOpacity className="h-11 w-11 items-center justify-center rounded-full border border-[#E7E0D7] bg-white/90">
              <Ionicons name="settings-outline" size={20} color="#0f172a" />
            </TouchableOpacity>
          </Link>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">
          Bienvenue
        </Text>
        <Text className="mt-2 text-base text-[#475569]">
          Lance un trajet en un geste et garde tes proches informes.
        </Text>

        <View className="mt-4 flex-row flex-wrap gap-2">
          <View className="rounded-full bg-emerald-100 px-3 py-1">
            <Text className="text-xs font-semibold text-emerald-800">Trajet surveille</Text>
          </View>
          <View className="rounded-full bg-amber-100 px-3 py-1">
            <Text className="text-xs font-semibold text-amber-800">Alertes actives</Text>
          </View>
          <View className="rounded-full bg-slate-200 px-3 py-1">
            <Text className="text-xs font-semibold text-slate-700">Partage simple</Text>
          </View>
        </View>

        <View className="mt-8 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">
            Nouveau trajet
          </Text>
          <Text className="mt-3 text-2xl font-extrabold text-[#0F172A]">
            Pret a partir ?
          </Text>
          <Text className="mt-2 text-sm text-slate-600">
            Choisis tes adresses et previent tes contacts en un message.
          </Text>
          <Link href="/setup" asChild>
            <TouchableOpacity className="mt-4 rounded-2xl bg-[#111827] px-5 py-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-white">
                  Demarrer un trajet
                </Text>
                <View className="h-9 w-9 items-center justify-center rounded-full bg-white/15">
                  <Text className="text-sm font-semibold text-white">GO</Text>
                </View>
              </View>
            </TouchableOpacity>
          </Link>
        </View>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Apercu</Text>
          <Text className="mt-2 text-lg font-bold text-[#0F172A]">Tes essentiels</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Un coup d oeil sur tes favoris et trajets recents.
          </Text>
          <View className="mt-4 flex-row flex-wrap gap-2">
            <View className="rounded-full bg-emerald-100 px-3 py-2">
              <Text className="text-xs font-semibold text-emerald-800">
                {stats.addresses} lieu(x) favori(s)
              </Text>
            </View>
            <View className="rounded-full bg-amber-100 px-3 py-2">
              <Text className="text-xs font-semibold text-amber-800">
                {stats.contacts} contact(s)
              </Text>
            </View>
            <View className="rounded-full bg-slate-200 px-3 py-2">
              <Text className="text-xs font-semibold text-slate-700">
                {stats.trips} trajet(s)
              </Text>
            </View>
          </View>
          {loadingData ? (
            <Text className="mt-3 text-xs text-slate-500">Mise a jour...</Text>
          ) : null}
        </View>

        {lastSession ? (
          <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
            <Text className="text-xs uppercase tracking-widest text-slate-500">
              Dernier trajet
            </Text>
            <Text className="mt-2 text-lg font-bold text-[#0F172A]">
              Reprendre en 1 clic
            </Text>
            <Text className="mt-2 text-sm text-slate-600">Depart</Text>
            <Text className="text-sm text-slate-800">{lastSession.from_address}</Text>
            <Text className="mt-2 text-sm text-slate-600">Arrivee</Text>
            <Text className="text-sm text-slate-800">{lastSession.to_address}</Text>
            <View className="mt-4 flex-row gap-2">
              <TouchableOpacity
                className="flex-1 rounded-2xl bg-[#111827] px-4 py-3"
                onPress={() =>
                  router.push({
                    pathname: "/setup",
                    params: { from: lastSession.from_address, to: lastSession.to_address }
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
                    params: { sessionId: lastSession.id, mode: "walking" }
                  })
                }
              >
                <Text className="text-center text-sm font-semibold text-slate-800">
                  Suivre
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View className="mt-6 gap-4">
          <View className="rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
            <Text className="text-xs uppercase tracking-widest text-slate-500">
              Favoris
            </Text>
            <Text className="mt-2 text-lg font-bold text-[#0F172A]">
              Gagne du temps
            </Text>
            <Text className="mt-2 text-sm text-slate-600">
              Enregistre tes adresses et contacts preferes.
            </Text>
            <Link href="/favorites" asChild>
              <TouchableOpacity className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <Text className="text-center text-sm font-semibold text-slate-800">
                  Gerer mes favoris
                </Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View className="rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
            <Text className="text-xs uppercase tracking-widest text-slate-500">
              Historique
            </Text>
            <Text className="mt-2 text-lg font-bold text-[#0F172A]">
              Mes trajets
            </Text>
            <Text className="mt-2 text-sm text-slate-600">
              Consulte tes derniers trajets et suivis.
            </Text>
            <Link href="/trips" asChild>
              <TouchableOpacity className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <Text className="text-center text-sm font-semibold text-slate-800">
                  Voir l historique
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>

        {errorMessage ? (
          <Text className="mt-4 text-sm text-red-600">{errorMessage}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
