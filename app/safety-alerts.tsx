import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  DEFAULT_SAFETY_ESCALATION_CONFIG,
  formatSafetyDelay,
  getSafetyEscalationConfig,
  resetSafetyEscalationConfig,
  SAFETY_CLOSE_CONTACT_OPTIONS,
  SAFETY_REMINDER_OPTIONS,
  setSafetyEscalationConfig
} from "../src/lib/safetyEscalation";
import { supabase } from "../src/lib/supabase";

export default function SafetyAlertsScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [reminderDelayMinutes, setReminderDelayMinutes] = useState<number>(30);
  const [closeContactsDelayMinutes, setCloseContactsDelayMinutes] = useState<number>(120);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
        const config = await getSafetyEscalationConfig();
        setEnabled(config.enabled);
        setReminderDelayMinutes(config.reminderDelayMinutes);
        setCloseContactsDelayMinutes(config.closeContactsDelayMinutes);
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

  const save = async () => {
    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");
      await setSafetyEscalationConfig({
        enabled,
        reminderDelayMinutes,
        closeContactsDelayMinutes
      });
      setSuccessMessage("Reglages enregistres.");
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
      await resetSafetyEscalationConfig();
      setEnabled(DEFAULT_SAFETY_ESCALATION_CONFIG.enabled);
      setReminderDelayMinutes(DEFAULT_SAFETY_ESCALATION_CONFIG.reminderDelayMinutes);
      setCloseContactsDelayMinutes(DEFAULT_SAFETY_ESCALATION_CONFIG.closeContactsDelayMinutes);
      setSuccessMessage("Reglages par defaut restaures.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur de reinitialisation.");
    } finally {
      setSaving(false);
    }
  };

  const busy = loading || saving;

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
          <Text className="text-2xl font-bold text-black">Alertes de retard</Text>
        </View>
        <Text className="mt-2 text-sm text-slate-600">
          Definis quand relancer l utilisateur et quand declencher l escalation pour les proches.
        </Text>

        <View className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs uppercase text-slate-500">Activation</Text>
          <View className="mt-3 flex-row gap-2">
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                enabled ? "bg-black" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setEnabled(true)}
            >
              <Text className={`text-center text-sm font-semibold ${enabled ? "text-white" : "text-slate-700"}`}>
                Active
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                !enabled ? "bg-black" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setEnabled(false)}
            >
              <Text className={`text-center text-sm font-semibold ${!enabled ? "text-white" : "text-slate-700"}`}>
                Desactive
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs uppercase text-slate-500">1ere alerte utilisateur</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Notification si la personne n est pas rentree apres ce delai.
          </Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {SAFETY_REMINDER_OPTIONS.map((value) => {
              const active = reminderDelayMinutes === value;
              return (
                <TouchableOpacity
                  key={`reminder-${value}`}
                  className={`rounded-full px-4 py-2 ${
                    active ? "bg-black" : "border border-slate-200 bg-white"
                  }`}
                  onPress={() => {
                    setReminderDelayMinutes(value);
                    if (closeContactsDelayMinutes < value) {
                      setCloseContactsDelayMinutes(value);
                    }
                  }}
                >
                  <Text className={active ? "text-white" : "text-slate-700"}>
                    {formatSafetyDelay(value)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs uppercase text-slate-500">2eme alerte proches</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Notification d escalation pour prevenir les proches si aucun retour.
          </Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {SAFETY_CLOSE_CONTACT_OPTIONS.map((value) => {
              const active = closeContactsDelayMinutes === value;
              const disabled = value < reminderDelayMinutes;
              return (
                <TouchableOpacity
                  key={`close-contact-${value}`}
                  className={`rounded-full px-4 py-2 ${
                    active ? "bg-black" : "border border-slate-200 bg-white"
                  } ${disabled ? "opacity-40" : ""}`}
                  onPress={() => {
                    if (disabled) return;
                    setCloseContactsDelayMinutes(value);
                  }}
                >
                  <Text className={active ? "text-white" : "text-slate-700"}>
                    {formatSafetyDelay(value)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-xs uppercase text-slate-500">Resume</Text>
          <Text className="mt-2 text-sm text-slate-700">
            {enabled
              ? `Actif: rappel a ${formatSafetyDelay(
                  reminderDelayMinutes
                )}, puis alerte proches a ${formatSafetyDelay(closeContactsDelayMinutes)}.`
              : "Desactive: aucune alerte automatique de retard."}
          </Text>

          {errorMessage ? (
            <Text className="mt-3 text-sm text-red-600">{errorMessage}</Text>
          ) : null}
          {successMessage ? (
            <Text className="mt-3 text-sm text-emerald-600">{successMessage}</Text>
          ) : null}

          <TouchableOpacity
            className={`mt-4 rounded-2xl px-4 py-3 ${busy ? "bg-slate-300" : "bg-black"}`}
            onPress={save}
            disabled={busy}
          >
            <Text className="text-center text-sm font-semibold text-white">
              {saving ? "Enregistrement..." : "Enregistrer les reglages"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
            onPress={reset}
            disabled={busy}
          >
            <Text className="text-center text-sm font-semibold text-slate-700">
              Revenir au defaut
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

