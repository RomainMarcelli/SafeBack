// Écran de configuration des profils de notification par groupe de contacts.
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  CONTACT_GROUPS,
  type ContactGroupKey,
  type ContactGroupProfilesMap,
  getContactGroupProfiles,
  resetContactGroupProfiles,
  setContactGroupProfiles
} from "../../src/lib/contacts/contactGroups";
import type { NotifyMode } from "../../src/lib/contacts/notifyChannels";
import { supabase } from "../../src/lib/core/supabase";

const NOTIFY_MODES: Array<{ key: NotifyMode; label: string }> = [
  { key: "auto", label: "Auto" },
  { key: "app", label: "Application" },
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" }
];

export default function ContactGroupsScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ContactGroupProfilesMap | null>(null);
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
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setProfiles(await getContactGroupProfiles());
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

  const updateProfile = (
    groupKey: ContactGroupKey,
    patch: Partial<ContactGroupProfilesMap[ContactGroupKey]>
  ) => {
    if (!profiles) return;
    setProfiles({
      ...profiles,
      [groupKey]: {
        ...profiles[groupKey],
        ...patch
      }
    });
  };

  const save = async () => {
    if (!profiles) return;
    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");
      const saved = await setContactGroupProfiles(profiles);
      setProfiles(saved);
      setSuccessMessage("Profils de groupes enregistres.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur de sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  const restoreDefaults = async () => {
    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");
      await resetContactGroupProfiles();
      setProfiles(await getContactGroupProfiles());
      setSuccessMessage("Profils par defaut restaures.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Erreur de reinitialisation.");
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
              Groupes
            </Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Groupes de proches</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Configure des profils d alerte differents pour la famille, les collegues et les amis.
        </Text>

        {loading || !profiles ? (
          <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5">
            <Text className="text-sm text-slate-600">Chargement...</Text>
          </View>
        ) : (
          CONTACT_GROUPS.map((group) => {
            const profile = profiles[group.key];
            return (
              <View key={group.key} className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
                <View className="flex-row items-center justify-between">
                  <Text className="text-lg font-bold text-slate-900">{group.label}</Text>
                  <View className="rounded-full px-3 py-1" style={{ backgroundColor: `${group.color}22` }}>
                    <Text className="text-xs font-semibold" style={{ color: group.color }}>
                      Profil actif
                    </Text>
                  </View>
                </View>

                <Text className="mt-4 text-xs uppercase tracking-widest text-slate-500">
                  Canal principal
                </Text>
                <View className="mt-2 flex-row flex-wrap gap-2">
                  {NOTIFY_MODES.map((mode) => {
                    const active = profile.notifyMode === mode.key;
                    return (
                      <TouchableOpacity
                        key={`${group.key}-${mode.key}`}
                        className={`rounded-full px-3 py-2 ${
                          active ? "bg-[#111827]" : "border border-slate-200 bg-white"
                        }`}
                        onPress={() => updateProfile(group.key, { notifyMode: mode.key })}
                      >
                        <Text className={`text-xs font-semibold ${active ? "text-white" : "text-slate-700"}`}>
                          {mode.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View className="mt-4 gap-2">
                  <ToggleRow
                    label="Alerte au depart"
                    enabled={profile.sendOnDeparture}
                    onToggle={() =>
                      updateProfile(group.key, { sendOnDeparture: !profile.sendOnDeparture })
                    }
                  />
                  <ToggleRow
                    label="Alertes de retard"
                    enabled={profile.receiveDelayAlerts}
                    onToggle={() =>
                      updateProfile(group.key, { receiveDelayAlerts: !profile.receiveDelayAlerts })
                    }
                  />
                  <ToggleRow
                    label="Confirmation d arrivee"
                    enabled={profile.sendOnArrival}
                    onToggle={() =>
                      updateProfile(group.key, { sendOnArrival: !profile.sendOnArrival })
                    }
                  />
                </View>
              </View>
            );
          })
        )}

        {errorMessage ? <Text className="mt-4 text-sm text-red-600">{errorMessage}</Text> : null}
        {successMessage ? <Text className="mt-4 text-sm text-emerald-600">{successMessage}</Text> : null}

        <TouchableOpacity
          className={`mt-6 rounded-2xl px-4 py-3 ${saving ? "bg-slate-300" : "bg-[#0F766E]"}`}
          onPress={save}
          disabled={saving || loading || !profiles}
        >
          <Text className="text-center text-sm font-semibold text-white">
            {saving ? "Enregistrement..." : "Enregistrer les profils"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
          onPress={restoreDefaults}
          disabled={saving || loading}
        >
          <Text className="text-center text-sm font-semibold text-amber-800">
            Revenir aux profils par defaut
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow(props: { label: string; enabled: boolean; onToggle: () => void }) {
  const { label, enabled, onToggle } = props;
  return (
    <TouchableOpacity
      className={`flex-row items-center justify-between rounded-2xl px-4 py-3 ${
        enabled ? "bg-emerald-50" : "bg-slate-100"
      }`}
      onPress={onToggle}
    >
      <Text className="text-sm font-semibold text-slate-800">{label}</Text>
      <View className={`rounded-full px-3 py-1 ${enabled ? "bg-emerald-600" : "bg-slate-400"}`}>
        <Text className="text-xs font-semibold text-white">{enabled ? "Actif" : "Off"}</Text>
      </View>
    </TouchableOpacity>
  );
}
