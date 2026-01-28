import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getPremium, setPremium } from "../src/lib/premium";
import { supabase } from "../src/lib/supabase";

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

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      <View className="flex-1 px-6 pt-16">
        <View className="flex-row items-center">
          <TouchableOpacity
            className="mr-3 rounded-full border border-slate-200 px-3 py-2"
            onPress={() => router.back()}
          >
            <Text className="text-sm font-semibold text-slate-700">Retour</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-black">Passer Premium</Text>
        </View>

        <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-sm font-semibold text-slate-900">Pourquoi Premium ?</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Le plan Premium debloque le calcul des trajets et la carte temps reel.
          </Text>
        </View>

        <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-sm font-semibold text-slate-900">Comparatif</Text>
          <View className="mt-4">
            <Text className="text-xs font-semibold uppercase text-slate-400">Free</Text>
            <Text className="mt-2 text-sm text-slate-700">- Creation de trajet</Text>
            <Text className="mt-1 text-sm text-slate-700">
              - Simulation d envoi (DEV / TEST)
            </Text>
            <Text className="mt-1 text-sm text-slate-700">
              - Favoris adresses et contacts
            </Text>
          </View>
          <View className="mt-5 border-t border-slate-100 pt-4">
            <Text className="text-xs font-semibold uppercase text-slate-400">Premium</Text>
            <Text className="mt-2 text-sm text-slate-700">
              - Calcul temps de trajet (pied/voiture/transit)
            </Text>
            <Text className="mt-1 text-sm text-slate-700">
              - Carte temps reel + itineraire
            </Text>
            <Text className="mt-1 text-sm text-slate-700">
              - Envoi SMS reel pour prevenir un proche
            </Text>
          </View>
        </View>

        <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-sm text-slate-600">
            La version Premium est payante. Le paiement Stripe sera ajoute ensuite.
          </Text>
          <TouchableOpacity
            className={`mt-4 rounded-2xl px-4 py-3 ${premium ? "bg-slate-200" : "bg-black"}`}
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
              className="mt-3 rounded-2xl border border-slate-200 px-4 py-3"
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
      </View>
    </SafeAreaView>
  );
}
