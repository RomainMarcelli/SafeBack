// Action rapide "bien rentré" déclenchable sans passer par le parcours complet.
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { clearActiveSessionId } from "../../src/lib/trips/activeSession";
import { syncSafeBackHomeWidget } from "../../src/lib/home/androidHomeWidget";
import { formatQuickArrivalMessage } from "../../src/lib/home/homeQuickActions";
import { sendArrivalSignalToGuardians } from "../../src/lib/social/messagingDb";
import { getPredefinedMessageConfig, resolvePredefinedMessage } from "../../src/lib/contacts/predefinedMessage";
import { supabase } from "../../src/lib/core/supabase";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";

export default function QuickArrivalScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Preparation...");
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
        setErrorMessage("");
        const config = await getPredefinedMessageConfig();
        const text = resolvePredefinedMessage(config);
        const result = await sendArrivalSignalToGuardians({ note: text });
        await clearActiveSessionId();
        await syncSafeBackHomeWidget({
          status: "arrived",
          note: "Confirmation envoyée",
          updatedAtIso: new Date().toISOString()
        });
        setMessage(formatQuickArrivalMessage(result.conversations));
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Impossible d envoyér la confirmation.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <View className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#FAD4A6] opacity-70" />
      <View className="absolute top-32 -left-28 h-72 w-72 rounded-full bg-[#BFE9D6] opacity-60" />
      <View className="absolute bottom-24 -right-32 h-72 w-72 rounded-full bg-[#C7DDF8] opacity-40" />

      <View className="flex-1 items-center justify-center px-6">
        <View className="w-full rounded-3xl border border-[#E7E0D7] bg-white/90 p-6 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Action rapide</Text>
          <Text className="mt-3 text-3xl font-extrabold text-[#0F172A]">Je suis bien rentré</Text>
          {loading ? (
            <View className="mt-4 flex-row items-center">
              <ActivityIndicator size="small" color="#334155" />
              <Text className="ml-2 text-sm text-slate-600">Envoi en cours...</Text>
            </View>
          ) : errorMessage ? (
            <FeedbackMessage kind="error" message={errorMessage} />
          ) : (
            <FeedbackMessage kind="success" message={message} />
          )}
          <TouchableOpacity
            className="mt-5 rounded-2xl bg-[#111827] px-4 py-3"
            onPress={() => router.replace("/")}
          >
            <Text className="text-center text-sm font-semibold text-white">Retour accueil</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
