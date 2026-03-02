// Ecran sécurité: liste des appareils connectés et action "déconnecter les autres".
import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppToast } from "../../src/components/AppToastProvider";
import {
  disconnectOtherDevices,
  getOrCreateCurrentDeviceId,
  listMyDeviceSessions,
  type DeviceSession
} from "../../src/lib/security/deviceSessions";
import { supabase } from "../../src/lib/core/supabase";
import { logPrivacyEvent } from "../../src/lib/privacy/privacyCenter";
import { PremiumEmptyState } from "../../src/components/ui/PremiumEmptyState";
import { SkeletonCard } from "../../src/components/ui/Skeleton";

function formatLastSeen(iso?: string | null): string {
  if (!iso) return "Jamais";
  const date = new Date(iso);
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function SessionsDevicesScreen() {
  const router = useRouter();
  const { showToast } = useAppToast();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyRevoke, setBusyRevoke] = useState(false);
  const [rows, setRows] = useState<DeviceSession[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const activeRows = useMemo(() => rows.filter((row) => !row.revoked_at), [rows]);

  const refresh = async () => {
    setLoading(true);
    const [list, deviceId] = await Promise.all([listMyDeviceSessions(), getOrCreateCurrentDeviceId()]);
    setRows(list);
    setCurrentDeviceId(deviceId);
    setLoading(false);
  };

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
    if (!userId) return;
    refresh().catch((error: any) => {
      setErrorMessage(error?.message ?? "Impossible de charger les appareils.");
      setLoading(false);
    });
  }, [userId]);

  useEffect(() => {
    if (!errorMessage) return;
    showToast({ kind: "error", message: errorMessage, durationMs: 5000 });
    setErrorMessage("");
  }, [errorMessage, showToast]);

  useEffect(() => {
    if (!successMessage) return;
    showToast({ kind: "success", message: successMessage, durationMs: 3600 });
    setSuccessMessage("");
  }, [successMessage, showToast]);

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 56 }}>
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
              Sécurité
            </Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Sessions & appareils</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Vérifie les appareils connectés à ton compte et coupe les autres en un clic.
        </Text>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Action principale</Text>
          <Text className="mt-2 text-sm text-slate-700">
            Appareils actifs: {activeRows.length}
          </Text>
          <TouchableOpacity
            className={`mt-4 rounded-2xl px-4 py-4 ${busyRevoke ? "bg-slate-300" : "bg-[#111827]"}`}
            disabled={busyRevoke || loading}
            onPress={async () => {
              try {
                setBusyRevoke(true);
                setErrorMessage("");
                setSuccessMessage("");
                const count = await disconnectOtherDevices();
                await logPrivacyEvent({
                  type: "device_sessions_revoked",
                  message:
                    count > 0
                      ? `${count} appareil(s) déconnecté(s) depuis l'écran Sessions & appareils.`
                      : "Aucune autre session à déconnecter.",
                  data: { revokedCount: count }
                });
                await refresh();
                setSuccessMessage(
                  count > 0
                    ? `${count} appareil(s) déconnecté(s).`
                    : "Aucun autre appareil actif à déconnecter."
                );
              } catch (error: any) {
                setErrorMessage(error?.message ?? "Impossible de déconnecter les autres appareils.");
              } finally {
                setBusyRevoke(false);
              }
            }}
          >
            <Text className="text-center text-sm font-semibold text-white">
              {busyRevoke ? "Déconnexion..." : "Déconnecter tous les autres"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3"
            onPress={() => {
              setErrorMessage("");
              setSuccessMessage("");
              refresh().catch((error: any) => {
                setErrorMessage(error?.message ?? "Impossible de rafraîchir les appareils.");
              });
            }}
            disabled={loading || busyRevoke}
          >
            <Text className="text-center text-sm font-semibold text-slate-700">
              {loading ? "Chargement..." : "Rafraîchir"}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Appareils connectés</Text>
          {loading ? (
            <View className="mt-3 gap-2">
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : rows.length === 0 ? (
            <View className="mt-3">
              <PremiumEmptyState
                title="Aucun appareil enregistré"
                description="Reconnecte-toi pour recréer automatiquement une session appareil."
                icon="phone-portrait-outline"
              />
            </View>
          ) : (
            rows.map((row) => {
              const isCurrent = row.device_id === currentDeviceId;
              return (
                <View
                  key={row.id}
                  className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-slate-900">{row.device_label}</Text>
                    {isCurrent ? (
                      <View className="rounded-full bg-emerald-100 px-2 py-0.5">
                        <Text className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                          Appareil actuel
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className="mt-1 text-xs text-slate-600">
                    Plateforme: {row.platform} · Version app: {row.app_version ?? "n/a"}
                  </Text>
                  <Text className="mt-1 text-xs text-slate-600">
                    Dernière activité: {formatLastSeen(row.last_seen_at)}
                  </Text>
                  <Text className={`mt-1 text-xs ${row.revoked_at ? "text-rose-700" : "text-emerald-700"}`}>
                    {row.revoked_at
                      ? `Déconnecté le ${formatLastSeen(row.revoked_at)}`
                      : "Session active"}
                  </Text>
                </View>
              );
            })
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
