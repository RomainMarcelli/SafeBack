// Mode entraînement : faux SOS / faux retard pour valider la chaîne d'alerte sans crise réelle.
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { Redirect, useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../src/lib/core/supabase";
import { sendSosSignalToGuardians } from "../../src/lib/social/messagingDb";
import { logPrivacyEvent } from "../../src/lib/privacy/privacyCenter";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";

type DrillType = "sos" | "delay";

type DrillEntry = {
  id: string;
  type: DrillType;
  createdAt: string;
  notifyGuardians: boolean;
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${day}/${month} ${hours}:${minutes}:${seconds}`;
}

export default function SafetyDrillScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [notifyGuardians, setNotifyGuardians] = useState(false);
  const [history, setHistory] = useState<DrillEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

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

  const runDrill = async (type: DrillType) => {
    try {
      setRunning(true);
      setErrorMessage("");
      setInfoMessage("");

      const nowIso = new Date().toISOString();
      const title = type === "sos" ? "Exercice SOS" : "Exercice retard";
      const body =
        type === "sos"
          ? "Simulation lancée: vérifie la réception et le circuit d'escalade."
          : "Simulation retard lancée: vérifie les relances planifiées.";

      await supabase.from("app_notifications").insert({
        user_id: userId,
        notification_type: "safety_drill",
        title,
        body,
        data: {
          event_type: type === "sos" ? "drill_sos" : "drill_delay",
          notify_guardians: notifyGuardians
        }
      });

      if (notifyGuardians) {
        if (type === "sos") {
          await sendSosSignalToGuardians({
            body: "[Exercice SafeBack] Test SOS en cours. Aucune action d'urgence requise."
          });
        } else {
          await sendSosSignalToGuardians({
            body: "[Exercice SafeBack] Test retard en cours. Aucune action d'urgence requise."
          });
        }
      }

      if (Constants.appOwnership !== "expo") {
        const Notifications = await import("expo-notifications");
        const perm = await Notifications.getPermissionsAsync();
        let status = perm.status;
        if (status !== "granted") {
          const requested = await Notifications.requestPermissionsAsync();
          status = requested.status;
        }
        if (status === "granted") {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `${title} · résultat attendu`,
              body: "Si tu vois cette notification, la chaîne locale fonctionne correctement."
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: 8,
              repeats: false
            }
          });
        }
      }

      await logPrivacyEvent({
        type: "permission_snapshot",
        message: `${title} exécuté.`,
        data: {
          drill_type: type,
          notify_guardians: notifyGuardians
        }
      });

      setHistory((prev) => [
        {
          id: `${type}-${Date.now()}`,
          type,
          createdAt: nowIso,
          notifyGuardians
        },
        ...prev
      ]);
      setInfoMessage(
        notifyGuardians
          ? `${title} lancé avec envoi aux garants (mode entraînement).`
          : `${title} lancé en mode local.`
      );
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible de lancer la simulation.");
    } finally {
      setRunning(false);
    }
  };

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
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">Drill</Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Simulation de crise</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Teste un faux SOS ou un faux retard pour vérifier ton circuit d'alerte sans situation réelle.
        </Text>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Portée de la simulation</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Active l'envoi aux garants uniquement si ton cercle est informé qu'il s'agit d'un test.
          </Text>
          <View className="mt-3 flex-row gap-2">
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                !notifyGuardians ? "bg-[#111827]" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setNotifyGuardians(false)}
            >
              <Text className={`text-center text-sm font-semibold ${!notifyGuardians ? "text-white" : "text-slate-700"}`}>
                Local uniquement
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                notifyGuardians ? "bg-amber-600" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setNotifyGuardians(true)}
            >
              <Text className={`text-center text-sm font-semibold ${notifyGuardians ? "text-white" : "text-slate-700"}`}>
                Inclure garants
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Lancer un exercice</Text>
          <TouchableOpacity
            className={`mt-3 rounded-2xl px-4 py-3 ${running ? "bg-slate-300" : "bg-rose-600"}`}
            onPress={() => {
              runDrill("sos").catch(() => {
                // no-op : erreur déjà affichée.
              });
            }}
            disabled={running}
          >
            <Text className="text-center text-sm font-semibold text-white">Faux SOS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`mt-3 rounded-2xl px-4 py-3 ${running ? "bg-slate-300" : "bg-cyan-700"}`}
            onPress={() => {
              runDrill("delay").catch(() => {
                // no-op : erreur déjà affichée.
              });
            }}
            disabled={running}
          >
            <Text className="text-center text-sm font-semibold text-white">Faux retard</Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Historique d'exercices</Text>
          {history.length === 0 ? (
            <View className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Text className="text-sm text-slate-600">Aucun exercice lancé pour le moment.</Text>
            </View>
          ) : (
            history.map((entry) => (
              <View key={entry.id} className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <Text className="text-sm font-semibold text-slate-900">
                  {entry.type === "sos" ? "Exercice SOS" : "Exercice retard"}
                </Text>
                <Text className="mt-1 text-xs text-slate-600">{formatDateTime(entry.createdAt)}</Text>
                <Text className="mt-1 text-xs text-slate-500">
                  Portée: {entry.notifyGuardians ? "avec garants" : "locale uniquement"}
                </Text>
              </View>
            ))
          )}
        </View>

        {errorMessage ? <FeedbackMessage kind="error" message={errorMessage} /> : null}
        {infoMessage ? <FeedbackMessage kind="info" message={infoMessage} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
