// Écran de personnalisation des messages prédéfinis utilisés dans les flux de sécurité.
import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  DEFAULT_PREDEFINED_MESSAGE,
  getPredefinedMessageConfig,
  resetPredefinedMessageConfig,
  resolvePredefinedMessage,
  setPredefinedMessageConfig
} from "../../src/lib/contacts/predefinedMessage";
import { supabase } from "../../src/lib/core/supabase";

export default function PredefinedMessageScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [useCustomMessage, setUseCustomMessage] = useState(false);
  const [message, setMessage] = useState(DEFAULT_PREDEFINED_MESSAGE);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

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
    (async () => {
      try {
        setLoading(true);
        const config = await getPredefinedMessageConfig();
        setUseCustomMessage(config.useCustomMessage);
        setMessage(config.message);
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

  const preview = useMemo(
    () => resolvePredefinedMessage({ useCustomMessage, message }),
    [useCustomMessage, message]
  );
  const characters = message.trim().length;

  const save = async () => {
    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");
      await setPredefinedMessageConfig({ useCustomMessage, message });
      setSuccessMessage("Message enregistr\u00e9.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur de sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");
      await resetPredefinedMessageConfig();
      setUseCustomMessage(false);
      setMessage(DEFAULT_PREDEFINED_MESSAGE);
      setSuccessMessage("Message par d\u00e9faut restaur\u00e9.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur de r\u00e9initialisation.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <View className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#FAD4A6] opacity-70" />
      <View className="absolute top-32 -left-28 h-72 w-72 rounded-full bg-[#BFE9D6] opacity-60" />
      <View className="absolute bottom-24 -right-32 h-72 w-72 rounded-full bg-[#C7DDF8] opacity-40" />

      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="mt-6 flex-row items-center justify-between">
          <TouchableOpacity
            className="flex-row items-center rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={16} color="#334155" />
            <Text className="ml-1 text-xs font-semibold uppercase tracking-widest text-slate-700">
              Retour
            </Text>
          </TouchableOpacity>
          <View className="rounded-full bg-[#111827] px-3 py-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">
              Message
            </Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">
          {"Message pr\u00e9d\u00e9fini"}
        </Text>
        <Text className="mt-2 text-base text-[#475569]">
          {"Configure ton message rapide \u00e0 envoyer \u00e0 tes proches quand tu es bien rentr\u00e9."}
        </Text>

        <View className="mt-6 rounded-3xl bg-[#111827] px-5 py-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-300">
            {"Message par d\u00e9faut"}
          </Text>
          <Text className="mt-2 text-2xl font-extrabold text-white">{DEFAULT_PREDEFINED_MESSAGE}</Text>
          <View className="mt-4 flex-row gap-2">
            <View className="rounded-full bg-white/10 px-3 py-1">
              <Text className="text-xs font-semibold text-slate-200">Simple</Text>
            </View>
            <View className="rounded-full bg-white/10 px-3 py-1">
              <Text className="text-xs font-semibold text-slate-200">Rapide</Text>
            </View>
            <View className="rounded-full bg-white/10 px-3 py-1">
              <Text className="text-xs font-semibold text-slate-200">Personnalisable</Text>
            </View>
          </View>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Choix du message</Text>
          <View className="mt-3 flex-row gap-2">
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                !useCustomMessage ? "bg-[#0F172A]" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setUseCustomMessage(false)}
            >
              <Text
                className={`text-center text-sm font-semibold ${
                  !useCustomMessage ? "text-white" : "text-slate-700"
                }`}
              >
                {"Par d\u00e9faut"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                useCustomMessage ? "bg-[#0EA5E9]" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setUseCustomMessage(true)}
            >
              <Text
                className={`text-center text-sm font-semibold ${
                  useCustomMessage ? "text-white" : "text-slate-700"
                }`}
              >
                {"Personnalis\u00e9"}
              </Text>
            </TouchableOpacity>
          </View>

          <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">Texte du message</Text>
          <TextInput
            className={`mt-2 min-h-[110px] rounded-2xl border px-4 py-3 text-base leading-6 ${
              useCustomMessage
                ? "border-slate-200 bg-white text-slate-900"
                : "border-slate-100 bg-slate-100 text-slate-500"
            }`}
            placeholder={"\u00c9cris ton message"}
            value={message}
            onChangeText={setMessage}
            editable={useCustomMessage}
            multiline
            textAlignVertical="top"
          />
          <Text className="mt-2 text-xs text-slate-500">{`${characters} caract\u00e8res`}</Text>

          <View className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <Text className="text-xs uppercase tracking-widest text-emerald-700">{"Aper\u00e7u"}</Text>
            <Text className="mt-2 text-sm font-semibold text-slate-800">{preview}</Text>
          </View>

          {errorMessage ? <Text className="mt-3 text-sm text-red-600">{errorMessage}</Text> : null}
          {successMessage ? <Text className="mt-3 text-sm text-emerald-600">{successMessage}</Text> : null}

          <TouchableOpacity
            className={`mt-5 rounded-2xl px-4 py-3 ${
              saving || loading ? "bg-slate-300" : "bg-[#0F766E]"
            }`}
            onPress={save}
            disabled={saving || loading}
          >
            <Text className="text-center text-sm font-semibold text-white">
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
            onPress={reset}
            disabled={saving || loading}
          >
            <Text className="text-center text-sm font-semibold text-amber-800">
              {"Revenir au message par d\u00e9faut"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
