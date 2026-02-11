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
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      <View className="flex-1 px-6 pt-16">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs uppercase text-slate-500">SafeBack</Text>
            <Text className="text-3xl font-extrabold text-black">Bienvenue</Text>
            <Text className="mt-1 text-base text-slate-600">
              Configure ton trajet en un geste.
            </Text>
          </View>
          <View className="flex-row items-center gap-3">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-black">
              <Text className="text-xl font-bold text-white">SB</Text>
            </View>
            <Link href="/account" asChild>
              <TouchableOpacity className="h-10 w-10 items-center justify-center rounded-full border border-slate-200">
                <Ionicons name="settings-outline" size={20} color="#0f172a" />
              </TouchableOpacity>
            </Link>
          </View>
        </View>

        <View className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-sm font-semibold text-slate-900">Etape 1</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Ajoute tes adresses et contacts favoris pour gagner du temps.
          </Text>
          <View className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
            <Text className="text-sm text-slate-700">Favoris</Text>
          </View>
          <View className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <Link href="/favorites" className="text-center text-sm font-semibold text-black">
              Gerer mes favoris
            </Link>
          </View>
        </View>

        <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-sm font-semibold text-slate-900">Etape 2</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Choisis ton trajet, puis selectionne les contacts a prevenir.
          </Text>
          <View className="mt-3 rounded-2xl bg-black px-5 py-4">
            <Link href="/setup" className="text-center text-base font-semibold text-white">
              Demarrer un trajet
            </Link>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
