// Centre de confidentialité : permissions locales, journal des partages et actions de réinitialisation.
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Contacts from "expo-contacts";
import * as Location from "expo-location";
import { deleteMyAccountCascade, getProfile, upsertProfile } from "../../src/lib/core/db";
import { getPendingTripQueueCount } from "../../src/lib/trips/offlineTripQueue";
import { listPrivacyEvents, logPrivacyEvent, type PrivacyEvent } from "../../src/lib/privacy/privacyCenter";
import { confirmSensitiveAction } from "../../src/lib/privacy/confirmAction";
import { runPrivacyReset } from "../../src/lib/privacy/privacyReset";
import { getSafetyEscalationConfig } from "../../src/lib/safety/safetyEscalation";
import { listFriends, type FriendWithProfile } from "../../src/lib/social/friendsDb";
import { listGuardianAssignments } from "../../src/lib/social/messagingDb";
import { getFriendOnlineState, listFriendMapPresence, type FriendMapPresence } from "../../src/lib/social/friendMap";
import { supabase } from "../../src/lib/core/supabase";
import { useAppToast } from "../../src/components/AppToastProvider";
import { PremiumEmptyState } from "../../src/components/ui/PremiumEmptyState";
import { SkeletonCard } from "../../src/components/ui/Skeleton";
import { clearActiveSessionId } from "../../src/lib/trips/activeSession";
import { exportAndShareMyDataJson } from "../../src/lib/privacy/dataExport";

function formatDateTime(value: string): string {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export default function PrivacyCenterScreen() {
  const router = useRouter();
  const { showToast } = useAppToast();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyReset, setBusyReset] = useState(false);
  const [busyExport, setBusyExport] = useState(false);
  const [busyDeleteAccount, setBusyDeleteAccount] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [privacyEvents, setPrivacyEvents] = useState<PrivacyEvent[]>([]);
  const [guardianChecksEnabled, setGuardianChecksEnabled] = useState(false);
  const [mapShareEnabled, setMapShareEnabled] = useState(false);
  const [safetyEnabled, setSafetyEnabled] = useState(false);
  const [pendingOfflineTrips, setPendingOfflineTrips] = useState(0);
  const [consents, setConsents] = useState<{
    location: boolean;
    presence: boolean;
    notifications: boolean;
    liveShare: boolean;
    updatedAt: string | null;
  }>({
    location: false,
    presence: false,
    notifications: false,
    liveShare: false,
    updatedAt: null
  });
  const [friendRows, setFriendRows] = useState<
    Array<{
      friendId: string;
      label: string;
      guardian: boolean;
      networkState: "online" | "recently_offline" | "offline";
      lastPresenceAt?: string | null;
    }>
  >([]);
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
    const [profile, safetyConfig, pendingCount, events, locationPerm, contactsPerm, notificationsPerm, friends, guardianships] =
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
        })(),
        listFriends(),
        listGuardianAssignments()
      ]);

    setGuardianChecksEnabled(Boolean(profile?.allow_guardian_check_requests));
    setMapShareEnabled(Boolean(profile?.map_share_enabled));
    setSafetyEnabled(Boolean(safetyConfig.enabled));
    setPendingOfflineTrips(pendingCount);
    setPrivacyEvents(events);
    setConsents({
      location: Boolean(profile?.consent_location),
      presence: Boolean(profile?.consent_presence),
      notifications: Boolean(profile?.consent_notifications),
      liveShare: Boolean(profile?.consent_live_share),
      updatedAt: profile?.consent_updated_at ?? null
    });
    const nextPermissions = {
      location: String(locationPerm.status ?? "unknown"),
      contacts: String(contactsPerm.status ?? "unknown"),
      notifications: String(notificationsPerm.status ?? "unknown")
    };
    setPermissions(nextPermissions);

    const presenceRows = await listFriendMapPresence(friends.map((friend) => friend.friend_user_id));
    const presenceByUserId = new Map<string, FriendMapPresence>(
      presenceRows.map((row) => [row.user_id, row])
    );
    const activeGuardianIds = new Set(
      guardianships
        .filter((row) => row.owner_user_id === userId && row.status === "active")
        .map((row) => row.guardian_user_id)
    );
    const nextFriendRows = (friends as FriendWithProfile[]).map((friend) => {
      const presence = presenceByUserId.get(friend.friend_user_id);
      const username = String(friend.profile?.username ?? "").trim();
      const fullName = `${String(friend.profile?.first_name ?? "").trim()} ${String(
        friend.profile?.last_name ?? ""
      ).trim()}`.trim();
      return {
        friendId: friend.friend_user_id,
        label: username || fullName || `ID ${friend.profile?.public_id ?? friend.friend_user_id.slice(0, 8)}`,
        guardian: activeGuardianIds.has(friend.friend_user_id),
        networkState: getFriendOnlineState({
          network_connected: presence?.network_connected,
          updated_at: presence?.updated_at
        }),
        lastPresenceAt: presence?.updated_at ?? null
      };
    });
    setFriendRows(nextFriendRows);

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
        setErrorMessage(error?.message ?? "Impossible de charger le centre de confidentialité.");
      } finally {
        setLoading(false);
      }
    })();
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

  const updateConsent = async (params: {
    key: "location" | "presence" | "notifications" | "liveShare";
    nextValue: boolean;
  }) => {
    const { key, nextValue } = params;
    const payload =
      key === "location"
        ? { consent_location: nextValue }
        : key === "presence"
          ? { consent_presence: nextValue }
          : key === "notifications"
            ? { consent_notifications: nextValue }
            : { consent_live_share: nextValue };
    const label =
      key === "location"
        ? "Position"
        : key === "presence"
          ? "Présence réseau"
          : key === "notifications"
            ? "Notifications"
            : "Partage live";

    await upsertProfile(payload);
    await logPrivacyEvent({
      type: "consent_updated",
      message: `${label}: ${nextValue ? "autorisé" : "refusé"}.`,
      data: {
        consent: key,
        granted: nextValue
      }
    });
    await loadData();
    setSuccessMessage(`Consentement "${label}" mis à jour.`);
  };

  const exportMyDataAsJson = async () => {
    const confirmed = await confirmSensitiveAction({
      firstTitle: "Exporter toutes tes données ?",
      firstMessage:
        "SafeBack va générer un export JSON complet (profil, trajets, positions, messages, incidents et logs).",
      secondTitle: "Confirmer l'export",
      secondMessage: "Confirme pour lancer l'export RGPD.",
      secondConfirmLabel: "Exporter",
      delayMs: 700
    });
    if (!confirmed) return;

    try {
      setBusyExport(true);
      setErrorMessage("");
      setSuccessMessage("");
      const result = await exportAndShareMyDataJson();
      await logPrivacyEvent({
        type: "consent_updated",
        message: "Export JSON des données utilisateur généré.",
        data: {
          file_name: result.fileName,
          has_file_uri: Boolean(result.fileUri)
        }
      });
      setSuccessMessage("Export JSON généré et prêt au partage.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible de générer l'export JSON.");
    } finally {
      setBusyExport(false);
    }
  };

  const deleteMyAccountFromPrivacyCenter = async () => {
    const confirmed = await confirmSensitiveAction({
      firstTitle: "Supprimer définitivement ton compte ?",
      firstMessage:
        "Cette action supprime ton profil et toutes tes données liées (trajets, messages, incidents, logs, contacts).",
      secondTitle: "Dernière confirmation",
      secondMessage: "Confirme la suppression définitive de ton compte SafeBack.",
      secondConfirmLabel: "Supprimer",
      delayMs: 1000
    });
    if (!confirmed) return;

    try {
      setBusyDeleteAccount(true);
      setErrorMessage("");
      await deleteMyAccountCascade();
      await clearActiveSessionId();
      await supabase.auth.signOut();
      router.replace("/auth");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Suppression du compte impossible.");
    } finally {
      setBusyDeleteAccount(false);
    }
  };

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
              Confidentialité
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
            Visibilité carte proches: {mapShareEnabled ? "Activée" : "Désactivée"}
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

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Consentements granulaires</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Active uniquement ce que tu veux partager. Chaque changement est journalisé.
          </Text>
          <View className="mt-3 gap-2">
            {[
              {
                key: "location" as const,
                title: "Position GPS",
                subtitle: "Autoriser l'utilisation de la position dans l'app.",
                value: consents.location
              },
              {
                key: "presence" as const,
                title: "Présence réseau",
                subtitle: "Afficher ton état en ligne/hors ligne à tes proches.",
                value: consents.presence
              },
              {
                key: "notifications" as const,
                title: "Notifications",
                subtitle: "Recevoir les alertes importantes de sécurité.",
                value: consents.notifications
              },
              {
                key: "liveShare" as const,
                title: "Partage live",
                subtitle: "Autoriser le partage de trajet en direct.",
                value: consents.liveShare
              }
            ].map((consent) => (
              <View
                key={`consent-${consent.key}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <Text className="text-sm font-semibold text-slate-900">{consent.title}</Text>
                <Text className="mt-1 text-xs text-slate-600">{consent.subtitle}</Text>
                <TouchableOpacity
                  className={`mt-3 rounded-xl px-3 py-2 ${
                    consent.value ? "bg-emerald-600" : "bg-slate-200"
                  }`}
                  onPress={async () => {
                    try {
                      setErrorMessage("");
                      setSuccessMessage("");
                      await updateConsent({
                        key: consent.key,
                        nextValue: !consent.value
                      });
                    } catch (error: any) {
                      setErrorMessage(error?.message ?? "Impossible de mettre à jour ce consentement.");
                    }
                  }}
                >
                  <Text
                    className={`text-center text-xs font-semibold uppercase tracking-wider ${
                      consent.value ? "text-white" : "text-slate-700"
                    }`}
                  >
                    {consent.value ? "Activé" : "Désactivé"}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
          <Text className="mt-3 text-xs text-slate-500">
            Dernière mise à jour: {consents.updatedAt ? formatDateTime(consents.updatedAt) : "Aucune"}
          </Text>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Sessions & appareils</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Vérifie les appareils connectés et déconnecte tous les autres si nécessaire.
          </Text>
          <TouchableOpacity
            className="mt-3 rounded-2xl bg-[#111827] px-4 py-3"
            onPress={() => router.push("/sessions-devices")}
          >
            <Text className="text-center text-sm font-semibold text-white">
              Ouvrir Sessions & appareils
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">
            Documents légaux & RGPD
          </Text>
          <Text className="mt-2 text-sm text-slate-600">
            Consulte les documents légaux, exporte tes données ou supprime ton compte.
          </Text>
          <View className="mt-3 flex-row gap-2">
            <TouchableOpacity
              className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
              onPress={() => router.push("/legal/privacy")}
            >
              <Text className="text-center text-sm font-semibold text-slate-700">
                Politique de confidentialité
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
              onPress={() => router.push("/legal/terms")}
            >
              <Text className="text-center text-sm font-semibold text-slate-700">
                Conditions d utilisation
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            className={`mt-3 rounded-2xl px-4 py-3 ${
              busyExport ? "bg-slate-300" : "bg-[#111827]"
            }`}
            onPress={() => {
              exportMyDataAsJson().catch(() => {
                // no-op
              });
            }}
            disabled={busyExport}
          >
            <Text className="text-center text-sm font-semibold text-white">
              {busyExport ? "Export en cours..." : "Exporter mes données (JSON)"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`mt-2 rounded-2xl px-4 py-3 ${
              busyDeleteAccount ? "bg-rose-200" : "bg-rose-600"
            }`}
            onPress={() => {
              deleteMyAccountFromPrivacyCenter().catch(() => {
                // no-op
              });
            }}
            disabled={busyDeleteAccount}
          >
            <Text className="text-center text-sm font-semibold text-white">
              {busyDeleteAccount ? "Suppression..." : "Supprimer définitivement mon compte"}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Qui voit quoi (par proche)</Text>
          {loading ? (
            <View className="mt-3 gap-2">
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : friendRows.length === 0 ? (
            <View className="mt-3">
              <PremiumEmptyState
                title="Aucun proche configuré"
                description="Ajoute un proche dans Réseau proches pour piloter tes partages."
                icon="people-outline"
                actionLabel="Ouvrir Réseau proches"
                onActionPress={() => router.push("/friends")}
              />
            </View>
          ) : (
            friendRows.map((row) => (
              <View key={row.friendId} className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <Text className="text-sm font-semibold text-slate-900">{row.label}</Text>
                <Text className="mt-1 text-xs text-slate-600">
                  Position carte: {mapShareEnabled ? "Visible" : "Masquée"} · Garant: {row.guardian ? "Oui" : "Non"}
                </Text>
                <Text className="mt-1 text-xs text-slate-600">
                  Statut réseau proche: {row.networkState === "online" ? "En ligne" : row.networkState === "recently_offline" ? "Connexion récente" : "Hors ligne"}
                </Text>
                <Text className="mt-1 text-xs text-slate-500">
                  Historique d'accès (dernier signal): {row.lastPresenceAt ? formatDateTime(row.lastPresenceAt) : "Aucun"}
                </Text>
              </View>
            ))
          )}
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
              const confirmed = await confirmSensitiveAction({
                firstTitle: "Lancer le reset global ?",
                firstMessage: "Cette action coupe les partages et nettoie les files en'attente.",
                secondTitle: "Confirmer le reset global",
                secondMessage: "Confirme une seconde fois pour éviter une erreur de manipulation.",
                secondConfirmLabel: "Oui, réinitialiser"
              });
              if (!confirmed) return;
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
                setErrorMessage(error?.message ?? "Impossible de réinitialiser.");
              } finally {
                setBusyReset(false);
              }
            }}
            disabled={busyReset}
          >
            <Text className="text-center text-sm font-semibold text-white">
              {busyReset ? "Reset en cours..." : "Réinitialiser en 1 clic"}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Journal</Text>
          {loading ? (
            <View className="mt-3 gap-2">
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : privacyEvents.length === 0 ? (
            <View className="mt-3">
              <PremiumEmptyState
                title="Journal vide"
                description="Aucun événement pour le moment. Les changements de consentement apparaîtront ici."
                icon="document-text-outline"
              />
            </View>
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

      </ScrollView>
    </SafeAreaView>
  );
}
