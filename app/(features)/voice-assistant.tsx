// Assistant vocal basé sur la dictée clavier: interprète des commandes simples et navigue.
import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../src/lib/core/supabase";
import { getAccessibilityPreferences } from "../../src/lib/accessibility/preferences";
import { triggerAccessibleHaptic } from "../../src/lib/accessibility/feedback";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";

type VoiceCommand = {
  id: string;
  label: string;
  examples: string[];
  route: string;
};

const COMMANDS: VoiceCommand[] = [
  { id: "trip", label: "Démarrer un trajet", examples: ["démarrer trajet", "nouveau trajet"], route: "/setup" },
  { id: "sos", label: "SOS rapide", examples: ["sos", "aide urgente"], route: "/quick-sos" },
  { id: "arrival", label: "Je suis bien'arrivé", examples: ["bien'arrivé", "confirmation'arrivée"], route: "/quick-arrival" },
  { id: "messages", label: "Ouvrir messages", examples: ["ouvrir messages", "voir conversations"], route: "/messages" },
  { id: "map", label: "Carte des proches", examples: ["carte proches", "carte amis"], route: "/friends-map" },
  { id: "notifications", label: "Voir notifications", examples: ["ouvrir notifications", "centre alertes"], route: "/notifications" }
];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveCommand(text: string): VoiceCommand | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  for (const command of COMMANDS) {
    const keywords = [command.label, ...command.examples].map(normalizeText);
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return command;
    }
  }
  return null;
}

export default function VoiceAssistantScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [commandText, setCommandText] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setChecking(false);
      const prefs = await getAccessibilityPreferences();
      setVoiceEnabled(prefs.voiceCommandsEnabled);
    });
  }, []);

  const detectedCommand = useMemo(() => resolveCommand(commandText), [commandText]);

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="mt-6 flex-row items-center justify-between">
          <TouchableOpacity
            className="rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
            onPress={() => router.back()}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">Retour</Text>
          </TouchableOpacity>
          <View className="rounded-full bg-[#111827] px-3 py-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">Voice</Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Assistant vocal</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Utilise la dictée du clavier (micro intégré) puis exécute une action en une phrase.
        </Text>

        {!voiceEnabled ? (
          <View className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <Text className="text-sm font-semibold text-amber-800">
              Les commandes vocales sont désactivées dans Accessibilité.
            </Text>
            <TouchableOpacity
              className="mt-3 rounded-2xl border border-amber-200 bg-white px-4 py-3"
              onPress={() => router.push("/accessibility")}
            >
              <Text className="text-center text-sm font-semibold text-amber-700">Activer maintenant</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Commande</Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Ex: démarrer trajet / SOS / ouvrir messages"
            placeholderTextColor="#94a3b8"
            value={commandText}
            onChangeText={setCommandText}
            multiline
          />

          <View className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Text className="text-xs uppercase tracking-widest text-slate-500">Résultat détecté</Text>
            <Text className="mt-2 text-sm font-semibold text-slate-800">
              {detectedCommand ? detectedCommand.label : "Aucune commande reconnue"}
            </Text>
          </View>

          <TouchableOpacity
            className={`mt-3 rounded-2xl px-4 py-3 ${detectedCommand ? "bg-[#111827]" : "bg-slate-300"}`}
            onPress={async () => {
              if (!detectedCommand) return;
              try {
                setErrorMessage("");
                setInfoMessage("");
                await triggerAccessibleHaptic("success");
                router.push(detectedCommand.route as never);
              } catch (error: any) {
                setErrorMessage(error?.message ?? "Impossible d'exécuter la commande.");
              }
            }}
            disabled={!detectedCommand}
          >
            <Text className="text-center text-sm font-semibold text-white">Exécuter la commande</Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Exemples</Text>
          {COMMANDS.map((command) => (
            <View key={command.id} className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
              <Text className="text-sm font-semibold text-slate-900">{command.label}</Text>
              <Text className="mt-1 text-xs text-slate-600">{command.examples.join(" · ")}</Text>
            </View>
          ))}
        </View>

        {errorMessage ? <FeedbackMessage kind="error" message={errorMessage} /> : null}
        {infoMessage ? <FeedbackMessage kind="info" message={infoMessage} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
