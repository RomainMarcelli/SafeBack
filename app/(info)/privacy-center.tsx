// Centre de confidentialité : permissions locales, journal des partages et actions de réinitialisation.
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Contacts from "expo-contacts";
import * as Location from "expo-location";
import { getProfile } from "../../src/lib/core/db";
import { getPendingTripQueueCount } from "../../src/lib/trips/offlineTripQueue";
import { listPrivacyEvents, logPrivacyEvent, type PrivacyEvent } from "../../src/lib/privacy/privacyCenter";
import { runPrivacyReset } from "../../src/lib/privacy/privacyReset";
import { getSafetyEscalationConfig } from "../../src/lib/safety/safetyEscalation";
import { supabase } from "../../src/lib/core/supabase";

function formatDateTime(value: string): string {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month} ${hours}:${minutes}`;
}

export default function PrivacyCenterScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyReset, setBusyReset] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [privacyEvents, setPrivacyEvents] = useState<PrivacyEvent[]>([]);
  const [guardianChecksEnabled, setGuardianChecksEnabled] = useState(false);
  const [safetyEnabled, setSafetyEnabled] = useState(false);
  const [pendingOfflineTrips, setPendingOfflineTrips] = useState(0);
  const [permissions, setPermissions] = useState<{
    location: string;
    contacts: string;
    notifications: string;
  }>({
    location: "unknown",
    contacts: "unknown",
    notifications: "unknown"
  });

  const loadData = async () => {
    const [profile, safetyConfig, pendingCount, events, locationPerm, contactsPerm, notificationsPerm] =
      await Promise.all([
        getProfile(),
        getSafetyEscalationConfig(),
        getPendingTripQueueCount(),
        listPrivacyEvents(80),
        Location.getForegroundPermissionsAsync(),
        Contacts.getPermissionsAsync(),
        (async () => {
          try {
            const Notifications = await import("expo-notifications");
            return await Notifications.getPermissionsAsync();
          } catch {
            return { status: "unavailable" } as { status: string };
          }
        })()
      ]);

    setGuardianChecksEnabled(Boolean(profile?.allow_guardian_check_requests));
    setSafetyEnabled(Boolean(safetyConfig.enabled));
    setPendingOfflineTrips(pendingCount);
    setPrivacyEvents(events);
    const nextPermissions = {
      location: String(locationPerm.status ?? "unknown"),
      contacts: String(contactsPerm.status ?? "unknown"),
      notifications: String(notificationsPerm.status ?? "unknown")
    };
    setPermissions(nextPermissions);
    await logPrivacyEvent({
      type: "permission_snapshot",
      message: "Etat des permissions rafraichi.",
      data: nextPermissions
    });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setChecking(false);
    });
  }, []);

  useEffect(() => {
    if (!checking && !userId) {
      router.replace("/auth");
    }
  }, [checking, userId, router]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setLoading(true);
        setErrorMessage("");
        await loadData();
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Impossible de charger le centre de confidentialite.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (!checking && !userId) {
    return null;
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
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">
              Retour
            </Text>
          </TouchableOpacity>
          <View className="rounded-full bg-[#111827] px-3 py-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">
              Confidentialite
            </Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Centre de confidentialité</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Journal des partages, permissions et reset global en 1 clic.
        </Text>

        <View className="mt-6 rounded-3xl bg-[#111827] px-5 py-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-300">Etat rapide</Text>
          <Text className="mt-3 text-sm text-slate-200">
            Vérification garant: {guardianChecksEnabled ? "Activée" : "Désactivée"}
          </Text>
          <Text className="mt-2 text-sm text-slate-200">
            Alertes de retard: {safetyEnabled ? "Activées" : "Désactivées"}
          </Text>
          <Text className="mt-2 text-sm text-slate-200">
            Trajets en attente offline: {pendingOfflineTrips}
          </Text>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Permissions</Text>
          <Text className="mt-3 text-sm text-slate-700">Localisation: {permissions.location}</Text>
          <Text className="mt-2 text-sm text-slate-700">Contacts: {permissions.contacts}</Text>
          <Text className="mt-2 text-sm text-slate-700">Notifications: {permissions.notifications}</Text>
          <TouchableOpacity
            className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3"
            onPress={async () => {
              try {
                setLoading(true);
                setErrorMessage("");
                await loadData();
              } catch (error: any) {
                setErrorMessage(error?.message ?? "Impossible de rafraichir.");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
          >
            <Text className="text-center text-sm font-semibold text-slate-700">Rafraichir</Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-rose-700">Reset global</Text>
          <Text className="mt-2 text-sm text-rose-800">
            Désactive le partage live, bloque les demandes de nouvelles, vide la file offline et remet
            les alertes en mode discret.
          </Text>
          <TouchableOpacity
            className={`mt-4 rounded-2xl px-4 py-3 ${
              busyReset ? "bg-rose-200" : "bg-rose-600"
            }`}
            onPress={async () => {
              try {
                setBusyReset(true);
                setErrorMessage("");
                setSuccessMessage("");
                const result = await runPrivacyReset();
                await loadData();
                setSuccessMessage(
                  `Reset terminé. Partages arrêtés: ${result.disabledLiveShareCount}, trajets offline supprimés: ${result.clearedOfflineQueueCount}.`
                );
              } catch (error: any) {
                setErrorMessage(error?.message ?? "Impossible de reinitialiser.");
              } finally {
                setBusyReset(false);
              }
            }}
            disabled={busyReset}
          >
            <Text className="text-center text-sm font-semibold text-white">
              {busyReset ? "Reset en cours..." : "Reinitialiser en 1 clic"}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Journal</Text>
          {loading ? (
            <Text className="mt-3 text-sm text-slate-500">Chargement...</Text>
          ) : privacyEvents.length === 0 ? (
            <Text className="mt-3 text-sm text-slate-500">Aucun evenement de confidentialite.</Text>
          ) : (
            privacyEvents.map((event) => (
              <View
                key={event.id}
                className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <Text className="text-xs uppercase tracking-widest text-slate-500">{event.type}</Text>
                <Text className="mt-1 text-sm text-slate-800">{event.message}</Text>
                <Text className="mt-2 text-xs text-slate-500">{formatDateTime(event.createdAtIso)}</Text>
              </View>
            ))
          )}
        </View>

        {errorMessage ? <Text className="mt-4 text-sm text-red-600">{errorMessage}</Text> : null}
        {successMessage ? (
          <Text className="mt-4 text-sm text-emerald-600">{successMessage}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
