import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Link, Redirect } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";
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
    <SafeAreaView className="flex-1 bg-slate-100">
      <StatusBar style="dark" />
      <View className="flex-1 px-6 pt-8">
        <View className="rounded-[30px] bg-black px-5 py-6 shadow-sm">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-xs uppercase tracking-[2px] text-slate-300">SafeBack</Text>
              <Text className="mt-2 text-3xl font-extrabold text-white">Bienvenue</Text>
              <Text className="mt-2 text-sm leading-5 text-slate-300">
                Organise tes trajets et garde tes proches informes en direct.
              </Text>
            </View>
            <Link href="/account" asChild>
              <TouchableOpacity className="h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                <Ionicons name="settings-outline" size={20} color="#ffffff" />
              </TouchableOpacity>
            </Link>
          </View>

          <View className="mt-5 flex-row gap-2">
            <View className="flex-1 rounded-2xl bg-white/10 px-3 py-3">
              <Text className="text-[11px] uppercase tracking-[1px] text-slate-300">Favoris</Text>
              <Text className="mt-1 text-base font-bold text-white">Adresses + Contacts</Text>
            </View>
            <View className="flex-1 rounded-2xl bg-white/10 px-3 py-3">
              <Text className="text-[11px] uppercase tracking-[1px] text-slate-300">Suivi</Text>
              <Text className="mt-1 text-base font-bold text-white">Temps reel</Text>
            </View>
          </View>
        </View>

        <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-[1px] text-slate-500">Etape 1</Text>
          <Text className="mt-2 text-xl font-bold text-slate-900">Prepare tes favoris</Text>
          <Text className="mt-2 text-sm leading-5 text-slate-600">
            Enregistre tes adresses frequentes et les contacts a prevenir pour lancer un trajet
            plus vite.
          </Text>

          <Link href="/favorites" asChild>
            <TouchableOpacity className="mt-4 flex-row items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <Ionicons name="bookmark-outline" size={18} color="#0f172a" />
              <Text className="ml-2 text-sm font-semibold text-slate-900">Gerer mes favoris</Text>
            </TouchableOpacity>
          </Link>
        </View>

        <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-[1px] text-slate-500">Etape 2</Text>
          <Text className="mt-2 text-xl font-bold text-slate-900">Demarrer un trajet</Text>
          <Text className="mt-2 text-sm leading-5 text-slate-600">
            Choisis ton depart, ta destination, puis selectionne les personnes a notifier.
          </Text>

          <Link href="/setup" asChild>
            <TouchableOpacity className="mt-4 flex-row items-center justify-center rounded-2xl bg-black px-5 py-4">
              <Ionicons name="navigate-outline" size={18} color="#ffffff" />
              <Text className="ml-2 text-base font-semibold text-white">Demarrer un trajet</Text>
            </TouchableOpacity>
          </Link>

          <Link href="/trips" asChild>
            <TouchableOpacity className="mt-3 flex-row items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <Ionicons name="time-outline" size={18} color="#334155" />
              <Text className="ml-2 text-sm font-semibold text-slate-700">Voir mes trajets</Text>
            </TouchableOpacity>
          </Link>
        </View>

        <View className="mt-4 flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <Text className="text-sm text-slate-600">Besoin d options avancees ?</Text>
          <Link href="/premium" asChild>
            <TouchableOpacity className="rounded-xl bg-slate-900 px-3 py-2">
              <Text className="text-xs font-semibold text-white">Premium</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}
