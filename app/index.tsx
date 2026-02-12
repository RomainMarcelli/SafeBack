import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Link, Redirect } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../src/lib/supabase";

export default function HomeScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

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

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <View className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#FAD4A6] opacity-70" />
      <View className="absolute top-32 -left-28 h-72 w-72 rounded-full bg-[#BFE9D6] opacity-60" />
      <View className="absolute bottom-24 -right-32 h-72 w-72 rounded-full bg-[#C7DDF8] opacity-40" />

      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="mt-6 flex-row items-center justify-between">
          <View className="rounded-full bg-[#111827] px-3 py-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">
              Accueil
            </Text>
          </View>
          <Link href="/account" asChild>
            <TouchableOpacity className="rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2">
              <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">
                Mon compte
              </Text>
            </TouchableOpacity>
          </Link>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">SafeBack</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Lance rapidement un trajet, suis ta position et garde tes proches informes.
        </Text>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Action principale</Text>
          <Text className="mt-2 text-2xl font-bold text-slate-900">Demarrer un trajet</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Prepare ton depart, ta destination et les contacts a prevenir.
          </Text>

          <Link href="/setup" asChild>
            <TouchableOpacity className="mt-4 flex-row items-center justify-center rounded-2xl bg-[#111827] px-5 py-4">
              <Ionicons name="navigate-outline" size={18} color="#ffffff" />
              <Text className="ml-2 text-base font-semibold text-white">Nouveau trajet</Text>
            </TouchableOpacity>
          </Link>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Raccourcis</Text>
          <View className="mt-4 flex-row gap-2">
            <Link href="/favorites" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Text className="text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Favoris
                </Text>
                <Text className="mt-1 text-center text-sm font-semibold text-slate-800">
                  Adresses & contacts
                </Text>
              </TouchableOpacity>
            </Link>
            <Link href="/trips" asChild>
              <TouchableOpacity className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <Text className="text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Historique
                </Text>
                <Text className="mt-1 text-center text-sm font-semibold text-slate-800">
                  Mes trajets
                </Text>
              </TouchableOpacity>
            </Link>
          </View>

          <Link href="/predefined-message" asChild>
            <TouchableOpacity className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <Text className="text-center text-sm font-semibold text-slate-800">
                Message predefini aux proches
              </Text>
            </TouchableOpacity>
          </Link>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Securite</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Regle les alertes de retard et configure le partage de position en temps reel.
          </Text>
          <Link href="/safety-alerts" asChild>
            <TouchableOpacity className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <Text className="text-center text-sm font-semibold text-slate-800">
                Reglages alertes de retard
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

