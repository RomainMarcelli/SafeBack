import "../global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import Constants from "expo-constants";
import * as QuickActions from "expo-quick-actions";
import { type RouterAction } from "expo-quick-actions/router";
import { enableFreeze, enableScreens } from "react-native-screens";
import { startForgottenTripDetector } from "../src/services/forgottenTripDetector";
import { startAutoCheckinDetector } from "../src/services/autoCheckinDetector";
import { startFriendPresenceHeartbeat } from "../src/services/friendPresenceHeartbeat";
import { syncPendingTripLaunches } from "../src/lib/trips/offlineTripQueue";
import { supabase } from "../src/lib/core/supabase";

if (Constants.appOwnership === "expo") {
  enableScreens(false);
  enableFreeze(false);
}

export default function RootLayout() {
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
      }
      try {
        const stopAutoCheckin = await startAutoCheckinDetector({
          onInfo: (message) => console.log(`[auto-checkin] ${message}`)
        });
        stoppers.push(stopAutoCheckin);
      } catch (error) {
        console.log("[auto-checkin] detector start error", error);
      }
      try {
        const stopPresenceHeartbeat = await startFriendPresenceHeartbeat({
          onInfo: (message) => console.log(`[friend-presence] ${message}`)
        });
        stoppers.push(stopPresenceHeartbeat);
      } catch (error) {
        console.log("[friend-presence] heartbeat start error", error);
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
    (async () => {
      try {
        const supported = await QuickActions.isSupported();
        if (!supported) return;
        await QuickActions.setItems<RouterAction>([
          {
            id: "quick-trip",
            title: "Demarrer un trajet",
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
            title: "Je suis bien rentre",
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

  // Navigateur racine : garantit un contexte de navigation stable pour toutes les routes enfants.
  return <Stack screenOptions={{ headerShown: false }} />;
}
