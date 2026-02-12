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
} from "../../src/lib/safetyEscalation";
import { supabase } from "../../src/lib/supabase";

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
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <View className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#FAD4A6] opacity-70" />
      <View className="absolute top-32 -left-28 h-72 w-72 rounded-full bg-[#BFE9D6] opacity-60" />
      <View className="absolute bottom-24 -right-32 h-72 w-72 rounded-full bg-[#C7DDF8] opacity-40" />

      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 48 }}>
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
              Securite
            </Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Alertes de retard</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Regle les delais de relance utilisateur et d alerte proches.
        </Text>

        <View className="mt-6 rounded-3xl bg-[#111827] px-5 py-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-300">Resume</Text>
          <Text className="mt-2 text-2xl font-extrabold text-white">
            {enabled ? "Actif" : "Desactive"}
          </Text>
          <Text className="mt-2 text-sm text-slate-300">
            {enabled
              ? `Rappel: ${formatSafetyDelay(reminderDelayMinutes)} | Proches: ${formatSafetyDelay(closeContactsDelayMinutes)}`
              : "Aucune alerte automatique"}
          </Text>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Activation</Text>
          <View className="mt-3 flex-row gap-2">
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                enabled ? "bg-emerald-600" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setEnabled(true)}
            >
              <Text className={`text-center text-sm font-semibold ${enabled ? "text-white" : "text-slate-700"}`}>
                Active
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 rounded-2xl px-3 py-3 ${
                !enabled ? "bg-rose-600" : "border border-slate-200 bg-white"
              }`}
              onPress={() => setEnabled(false)}
            >
              <Text className={`text-center text-sm font-semibold ${!enabled ? "text-white" : "text-slate-700"}`}>
                Desactive
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">1ere alerte</Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {SAFETY_REMINDER_OPTIONS.map((value) => {
              const active = reminderDelayMinutes === value;
              return (
                <TouchableOpacity
                  key={`reminder-${value}`}
                  className={`rounded-full px-4 py-2 ${
                    active ? "bg-amber-500" : "border border-slate-200 bg-white"
                  }`}
                  onPress={() => {
                    setReminderDelayMinutes(value);
                    if (closeContactsDelayMinutes < value) {
                      setCloseContactsDelayMinutes(value);
                    }
                  }}
                >
                  <Text className={`text-sm font-semibold ${active ? "text-white" : "text-slate-700"}`}>
                    {formatSafetyDelay(value)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">2eme alerte</Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {SAFETY_CLOSE_CONTACT_OPTIONS.map((value) => {
              const active = closeContactsDelayMinutes === value;
              const disabled = value < reminderDelayMinutes;
              return (
                <TouchableOpacity
                  key={`close-contact-${value}`}
                  className={`rounded-full px-4 py-2 ${
                    active ? "bg-sky-600" : "border border-slate-200 bg-white"
                  } ${disabled ? "opacity-40" : ""}`}
                  onPress={() => {
                    if (disabled) return;
                    setCloseContactsDelayMinutes(value);
                  }}
                >
                  <Text className={`text-sm font-semibold ${active ? "text-white" : "text-slate-700"}`}>
                    {formatSafetyDelay(value)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {errorMessage ? <Text className="mt-3 text-sm text-red-600">{errorMessage}</Text> : null}
        {successMessage ? <Text className="mt-3 text-sm text-emerald-600">{successMessage}</Text> : null}

        <TouchableOpacity
          className={`mt-4 rounded-2xl px-4 py-3 ${busy ? "bg-slate-300" : "bg-[#0F766E]"}`}
          onPress={save}
          disabled={busy}
        >
          <Text className="text-center text-sm font-semibold text-white">
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
          onPress={reset}
          disabled={busy}
        >
          <Text className="text-center text-sm font-semibold text-amber-800">
            Revenir aux reglages par defaut
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
