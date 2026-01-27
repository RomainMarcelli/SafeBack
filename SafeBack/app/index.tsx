import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Link, Redirect } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar style="dark" />
      <View className="flex-1 px-6 pt-16">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs uppercase text-slate-500">SafeBack</Text>
            <Text className="text-3xl font-extrabold text-black">Bienvenue</Text>
            <Text className="mt-1 text-base text-slate-600">
              Configure ton retour en un geste.
            </Text>
          </View>
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-black">
            <Text className="text-xl font-bold text-white">SB</Text>
          </View>
        </View>

        <View className="mt-8 rounded-2xl border border-slate-200 bg-white p-4">
          <Text className="text-sm font-semibold text-slate-900">
            Prochain trajet
          </Text>
          <Text className="mt-2 text-sm text-slate-600">
            Renseigne le point de depart, la destination et les contacts.
          </Text>
          <View className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
            <Text className="text-xs text-slate-500">Conseil</Text>
            <Text className="text-sm text-slate-700">
              Ajoute tes favoris (maison, bureau) pour gagner du temps.
            </Text>
          </View>
        </View>

        <View className="mt-8 rounded-2xl bg-black px-5 py-4">
          <Link href="/setup" className="text-center text-base font-semibold text-white">
            Demarrer une soiree
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}
