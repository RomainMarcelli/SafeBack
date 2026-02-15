import "../global.css";
import { useEffect, useMemo, useState } from "react";
import { Stack, usePathname } from "expo-router";
import Constants from "expo-constants";
import * as QuickActions from "expo-quick-actions";
import { type RouterAction } from "expo-quick-actions/router";
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from "react-native";
import { enableFreeze, enableScreens } from "react-native-screens";
import { startForgottenTripDetector } from "../src/services/forgottenTripDetector";
import { startAutoCheckinDetector } from "../src/services/autoCheckinDetector";
import { startFriendPresenceHeartbeat } from "../src/services/friendPresenceHeartbeat";
import { startVolumeSosShortcut } from "../src/services/volumeSosShortcut";
import { syncPendingTripLaunches } from "../src/lib/trips/offlineTripQueue";
import { markNotificationRead, respondFriendWellbeingPing } from "../src/lib/social/messagingDb";
import { markRouteVisited } from "../src/lib/home/discoveryProgress";
import { supabase } from "../src/lib/core/supabase";
import { isCurrentDeviceRevoked, upsertCurrentDeviceSession } from "../src/lib/security/deviceSessions";
import { AppToastProvider } from "../src/components/AppToastProvider";
import { AppAccessibilityProvider } from "../src/components/AppAccessibilityProvider";
import {
  captureRuntimeError,
  installGlobalRuntimeErrorHandlers,
  trackUxMetric
} from "../src/lib/monitoring/runtimeMonitoring";
import { flushMonitoringToSupabase } from "../src/lib/monitoring/runtimeMonitoringTransport";

if (Constants.appOwnership === "expo") {
  enableScreens(false);
  enableFreeze(false);
}

export default function RootLayout() {
  const pathname = usePathname();
  const [pingPromptQueue, setPingPromptQueue] = useState<
    Array<{
      notificationId: string;
      pingId: string;
      title: string;
      body: string;
    }>
  >([]);
  const [pingPromptBusy, setPingPromptBusy] = useState(false);
  const [pingPromptError, setPingPromptError] = useState("");
  const activePingPrompt = useMemo(
    () => (pingPromptQueue.length > 0 ? pingPromptQueue[0] : null),
    [pingPromptQueue]
  );

  useEffect(() => {
    if (!pathname) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id;
        if (!userId || cancelled) return;
        await markRouteVisited(userId, pathname);
      } catch {
        // no-op: le tracking de découverte ne doit jamais bloquer l'app.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    const uninstall = installGlobalRuntimeErrorHandlers();
    trackUxMetric({
      name: "app_opened",
      context: "root_layout"
    }).catch(() => {
      // no-op
    });
    return () => {
      uninstall();
    };
  }, []);

  useEffect(() => {
    let stopDetectors: Array<() => void> = [];
    let cancelled = false;

    const ensureStopped = () => {
      if (stopDetectors.length > 0) {
        for (const stop of stopDetectors) {
          stop();
        }
        stopDetectors = [];
      }
    };

    const ensureStarted = async () => {
      ensureStopped();
      const stoppers: Array<() => void> = [];
      try {
        const stopForgotten = await startForgottenTripDetector({
          onInfo: (message) => console.log(`[forgotten-trip] ${message}`)
        });
        stoppers.push(stopForgotten);
      } catch (error) {
        console.log("[forgotten-trip] detector start error", error);
        captureRuntimeError({
          error,
          context: "detector_forgotten_trip_start"
        }).catch(() => {
          // no-op
        });
      }
      try {
        const stopAutoCheckin = await startAutoCheckinDetector({
          onInfo: (message) => console.log(`[auto-checkin] ${message}`)
        });
        stoppers.push(stopAutoCheckin);
      } catch (error) {
        console.log("[auto-checkin] detector start error", error);
        captureRuntimeError({
          error,
          context: "detector_auto_checkin_start"
        }).catch(() => {
          // no-op
        });
      }
      try {
        const stopPresenceHeartbeat = await startFriendPresenceHeartbeat({
          onInfo: (message) => console.log(`[friend-presence] ${message}`)
        });
        stoppers.push(stopPresenceHeartbeat);
      } catch (error) {
        console.log("[friend-presence] heartbeat start error", error);
        captureRuntimeError({
          error,
          context: "detector_friend_presence_start"
        }).catch(() => {
          // no-op
        });
      }
      try {
        const stopVolumeSosShortcut = await startVolumeSosShortcut({
          onInfo: (message) => console.log(`[volume-sos] ${message}`),
          onError: (error) => console.log("[volume-sos] start/runtime error", error)
        });
        stoppers.push(stopVolumeSosShortcut);
      } catch (error) {
        console.log("[volume-sos] shortcut start error", error);
        captureRuntimeError({
          error,
          context: "detector_volume_sos_start"
        }).catch(() => {
          // no-op
        });
      }
      if (cancelled) {
        for (const stop of stoppers) {
          stop();
        }
        return;
      }
      stopDetectors = stoppers;
    };

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.user) {
        ensureStarted();
      } else {
        ensureStopped();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session?.user) {
        ensureStarted();
      } else {
        ensureStopped();
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      ensureStopped();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const flush = async () => {
      try {
        await flushMonitoringToSupabase({
          maxRuntimeErrors: 40,
          maxUxMetrics: 80
        });
      } catch (error) {
        if (cancelled) return;
        console.log("[monitoring] flush error", error);
      }
    };

    flush();
    timer = setInterval(flush, 25000);

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      if (cancelled) return;
      flush();
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      if (timer) clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const syncDevicePresence = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.user || cancelled) return;
        await upsertCurrentDeviceSession();
        const revoked = await isCurrentDeviceRevoked();
        if (!revoked || cancelled) return;
        await supabase.auth.signOut();
        console.log("[security/device-session] current device revoked -> signOut");
      } catch (error) {
        console.log("[security/device-session] sync error", error);
        captureRuntimeError({
          error,
          context: "device_session_sync"
        }).catch(() => {
          // no-op
        });
      }
    };

    syncDevicePresence();
    interval = setInterval(syncDevicePresence, 45000);

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user || cancelled) return;
      syncDevicePresence();
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      if (interval) clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const supported = await QuickActions.isSupported();
        if (!supported) return;
        await QuickActions.setItems<RouterAction>([
          {
            id: "quick-trip",
            title: "Démarrer un trajet",
            icon: "location",
            params: { href: "/setup" }
          },
          {
            id: "quick-sos",
            title: "SOS rapide",
            icon: "prohibit",
            params: { href: "/quick-sos" }
          },
          {
            id: "quick-arrival",
            title: "Je suis bien rentré",
            icon: "confirmation",
            params: { href: "/quick-arrival" }
          },
          {
            id: "quick-incident",
            title: "Rapport incident",
            icon: "task",
            params: { href: "/incident-report" }
          }
        ]);
      } catch {
        // no-op : les actions rapides sont optionnelles et ne doivent pas bloquer le démarrage.
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: any = null;

    const resetChannel = () => {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };

    const enqueuePromptFromPayload = (row: any) => {
      if (!row || row.notification_type !== "friend_wellbeing_ping") return;
      const notificationId = String(row.id ?? "").trim();
      const pingId = String(row.data?.ping_id ?? "").trim();
      if (!notificationId || !pingId) return;
      const title = String(row.title ?? "Vérification d'arrivée");
      const body = String(
        row.body ?? "Un proche veut savoir si tu es bien arrivé. Réponds en un clic."
      );
      setPingPromptQueue((prev) => {
        if (prev.some((item) => item.notificationId === notificationId)) return prev;
        return [...prev, { notificationId, pingId, title, body }];
      });
    };

    const attachChannel = async (forcedUserId?: string | null) => {
      resetChannel();
      const resolvedUserId =
        forcedUserId ??
        (await supabase.auth.getSession()).data.session?.user.id ??
        null;
      if (!resolvedUserId || cancelled) return;

      // Au démarrage, remonte aussi les demandes non lues déjà présentes pour afficher la popup immédiatement.
      const { data: existingRows } = await supabase
        .from("app_notifications")
        .select("*")
        .eq("user_id", resolvedUserId)
        .eq("notification_type", "friend_wellbeing_ping")
        .is("read_at", null)
        .order("created_at", { ascending: true })
        .limit(5);
      for (const row of existingRows ?? []) {
        enqueuePromptFromPayload(row);
      }

      channel = supabase
        .channel(`friend-ping-prompts-${resolvedUserId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "app_notifications",
            filter: `user_id=eq.${resolvedUserId}`
          },
          (payload: any) => {
            if (cancelled) return;
            enqueuePromptFromPayload(payload.new);
          }
        )
        .subscribe();
    };

    attachChannel();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (!session?.user) {
        resetChannel();
        setPingPromptQueue([]);
        return;
      }
      attachChannel(session.user.id);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      resetChannel();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const runSync = async () => {
      if (cancelled) return;
      try {
        const result = await syncPendingTripLaunches();
        if (cancelled || result.syncedCount <= 0) return;
        if (Constants.appOwnership === "expo") return;
        const Notifications = await import("expo-notifications");
        const permissions = await Notifications.getPermissionsAsync();
        if (!permissions.granted) return;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "SafeBack",
            body: `${result.syncedCount} trajet(s) hors ligne synchronise(s).`
          },
          trigger: null
        });
      } catch {
        // no-op : la synchronisation réessaie automatiquement au prochain cycle.
      }
    };

    runSync();
    interval = setInterval(runSync, 30000);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  const closeActivePingPrompt = () => {
    setPingPromptError("");
    setPingPromptQueue((prev) => prev.slice(1));
  };

  const respondToActivePingPrompt = async (arrived: boolean) => {
    if (!activePingPrompt) return;
    try {
      setPingPromptBusy(true);
      setPingPromptError("");
      await respondFriendWellbeingPing({
        pingId: activePingPrompt.pingId,
        arrived
      });
      await markNotificationRead(activePingPrompt.notificationId);
      closeActivePingPrompt();
    } catch (error: any) {
      setPingPromptError(error?.message ?? "Impossible d'envoyer ta réponse.");
    } finally {
      setPingPromptBusy(false);
    }
  };

  // Navigateur racine : garantit un contexte de navigation stable pour toutes les routes enfants.
  return (
    <AppAccessibilityProvider>
      <AppToastProvider>
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false, animation: "fade_from_bottom" }} />
          <Modal transparent visible={Boolean(activePingPrompt)} animationType="fade">
            <View className="flex-1 items-center justify-center bg-black/50 px-6">
              <View className="w-full rounded-3xl border border-[#E7E0D7] bg-white p-5 shadow-lg">
                <Text className="text-[11px] font-semibold uppercase tracking-[2px] text-cyan-700">
                  Demande instantanée
                </Text>
                <Text className="mt-2 text-xl font-extrabold text-[#0F172A]">
                  {activePingPrompt?.title ?? "Vérification d'arrivée"}
                </Text>
                <Text className="mt-2 text-sm text-slate-700">
                  {activePingPrompt?.body ??
                    "Un proche souhaite confirmer que tu es bien arrivé."}
                </Text>

                {pingPromptError ? (
                  <Text className="mt-3 text-sm text-rose-700">{pingPromptError}</Text>
                ) : null}

                <View className="mt-4 flex-row gap-2">
                  <TouchableOpacity
                    className={`flex-1 rounded-2xl px-4 py-3 ${
                      pingPromptBusy ? "bg-slate-300" : "bg-emerald-600"
                    }`}
                    onPress={() => respondToActivePingPrompt(true)}
                    disabled={pingPromptBusy}
                  >
                    {pingPromptBusy ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text className="text-center text-sm font-semibold text-white">
                        Oui, bien arrivé
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    className={`flex-1 rounded-2xl px-4 py-3 ${
                      pingPromptBusy ? "bg-slate-300" : "bg-rose-600"
                    }`}
                    onPress={() => respondToActivePingPrompt(false)}
                    disabled={pingPromptBusy}
                  >
                    <Text className="text-center text-sm font-semibold text-white">
                      Non, pas encore
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  onPress={closeActivePingPrompt}
                  disabled={pingPromptBusy}
                >
                  <Text className="text-center text-sm font-semibold text-slate-700">Plus tard</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </View>
      </AppToastProvider>
    </AppAccessibilityProvider>
  );
}
