import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  DEFAULT_PREDEFINED_MESSAGE,
  getPredefinedMessageConfig,
  resetPredefinedMessageConfig,
  resolvePredefinedMessage,
  setPredefinedMessageConfig
} from "../src/lib/predefinedMessage";
import { supabase } from "../src/lib/supabase";

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

  const save = async () => {
    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");
      await setPredefinedMessageConfig({ useCustomMessage, message });
      setSuccessMessage("Message enregistre.");
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
      setSuccessMessage("Message par defaut restaure.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur de reinitialisation.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <StatusBar style="dark" />
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="mt-4 flex-row items-center">
          <TouchableOpacity
            className="mr-3 rounded-full border border-slate-200 px-3 py-2"
            onPress={() => router.back()}
          >
            <Text className="text-sm font-semibold text-slate-700">Retour</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-black">Message predefini</Text>
        </View>
        <Text className="mt-2 text-sm text-slate-600">
          Configure le message rapide a envoyer a tes proches.
        </Text>

        <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs uppercase text-slate-500">Message par defaut</Text>
          <Text className="mt-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
            {DEFAULT_PREDEFINED_MESSAGE}
          </Text>
        </View>

        <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs uppercase text-slate-500">Choix du message</Text>
          <View className="mt-3 flex-row gap-2">
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                !useCustomMessage ? "bg-black" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setUseCustomMessage(false)}
            >
              <Text
                className={`text-center text-sm font-semibold ${
                  !useCustomMessage ? "text-white" : "text-slate-700"
                }`}
              >
                Par defaut
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                useCustomMessage ? "bg-black" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setUseCustomMessage(true)}
            >
              <Text
                className={`text-center text-sm font-semibold ${
                  useCustomMessage ? "text-white" : "text-slate-700"
                }`}
              >
                Personnalise
              </Text>
            </TouchableOpacity>
          </View>

          <Text className="mt-4 text-xs uppercase text-slate-500">Texte du message</Text>
          <TextInput
            className={`mt-2 min-h-[110px] rounded-2xl border px-4 py-3 text-base leading-6 ${
              useCustomMessage
                ? "border-slate-200 bg-white text-slate-900"
                : "border-slate-100 bg-slate-100 text-slate-500"
            }`}
            placeholder="Ecris ton message"
            value={message}
            onChangeText={setMessage}
            editable={useCustomMessage}
            multiline
            textAlignVertical="top"
          />

          <View className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Text className="text-xs uppercase text-slate-500">Apercu</Text>
            <Text className="mt-2 text-sm font-semibold text-slate-800">{preview}</Text>
          </View>

          {errorMessage ? (
            <Text className="mt-3 text-sm text-red-600">{errorMessage}</Text>
          ) : null}
          {successMessage ? (
            <Text className="mt-3 text-sm text-emerald-600">{successMessage}</Text>
          ) : null}

          <TouchableOpacity
            className={`mt-5 rounded-2xl px-4 py-3 ${
              saving || loading ? "bg-slate-300" : "bg-black"
            }`}
            onPress={save}
            disabled={saving || loading}
          >
            <Text className="text-center text-sm font-semibold text-white">
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
            onPress={reset}
            disabled={saving || loading}
          >
            <Text className="text-center text-sm font-semibold text-slate-700">
              Revenir au message par defaut
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

