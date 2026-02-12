import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getPremium, setPremium } from "../../src/lib/premium";
import { supabase } from "../../src/lib/supabase";

export default function PremiumScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [premium, setPremiumState] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setChecking(false);
      const value = await getPremium();
      setPremiumState(value);
    });
  }, []);

  useEffect(() => {
    if (!checking && !userId) {
      router.replace("/auth");
    }
  }, [checking, userId, router]);

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
              Premium
            </Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">
          Passer Premium
        </Text>
        <Text className="mt-2 text-base text-[#475569]">
          Debloque le suivi complet et les trajets en temps reel.
        </Text>

        <View className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-amber-700">
            Pourquoi Premium ?
          </Text>
          <Text className="mt-3 text-lg font-semibold text-amber-900">
            Tout le suivi en un seul plan.
          </Text>
          <Text className="mt-2 text-sm text-amber-800">
            Le plan Premium debloque le calcul des trajets et la carte temps reel.
          </Text>
        </View>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Comparatif</Text>
          <View className="mt-4 rounded-2xl border border-slate-200 bg-[#F8FAFC] p-4">
            <Text className="text-xs font-semibold uppercase text-slate-400">Free</Text>
            <Text className="mt-2 text-sm text-slate-700">- Creation de trajet</Text>
            <Text className="mt-1 text-sm text-slate-700">
              - Simulation d envoi (DEV / TEST)
            </Text>
            <Text className="mt-1 text-sm text-slate-700">
              - Favoris adresses et contacts
            </Text>
          </View>
          <View className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <Text className="text-xs font-semibold uppercase text-emerald-700">Premium</Text>
            <Text className="mt-2 text-sm text-emerald-800">
              - Calcul temps de trajet (pied/voiture/transit)
            </Text>
            <Text className="mt-1 text-sm text-emerald-800">
              - Carte temps reel + itineraire
            </Text>
            <Text className="mt-1 text-sm text-emerald-800">
              - Envoi SMS reel pour prevenir un proche
            </Text>
          </View>
        </View>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-sm text-slate-600">
            La version Premium est payante. Le paiement Stripe sera ajoute ensuite.
          </Text>
          <TouchableOpacity
            className={`mt-4 rounded-2xl px-4 py-4 ${
              premium ? "bg-slate-200" : "bg-[#111827]"
            }`}
            onPress={async () => {
              await setPremium(true);
              setPremiumState(true);
            }}
            disabled={premium}
          >
            <Text
              className={`text-center text-sm font-semibold ${
                premium ? "text-slate-600" : "text-white"
              }`}
            >
              {premium ? "Premium actif" : "Passer Premium (mode test)"}
            </Text>
          </TouchableOpacity>
          {premium ? (
            <TouchableOpacity
              className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
              onPress={async () => {
                await setPremium(false);
                setPremiumState(false);
              }}
            >
              <Text className="text-center text-sm font-semibold text-slate-700">
                Desactiver
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

