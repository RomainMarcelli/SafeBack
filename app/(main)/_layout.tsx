import { useEffect, useMemo, useRef, useState } from "react";
import { Stack, router, usePathname } from "expo-router";
import { Animated, Easing, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Network from "expo-network";
import * as QuickActions from "expo-quick-actions";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isRouterAction } from "expo-quick-actions/router";
import { supabase } from "../../src/lib/core/supabase";
import { confirmAction } from "../../src/lib/privacy/confirmAction";
import { PUSH_CONSENT_KEY } from "../../src/lib/privacy/privacyKeys";
import { getUnreadNotificationsCount } from "../../src/lib/social/messagingDb";

type TabItem = {
  key: string;
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  badgeCount?: number;
};

const TABS: TabItem[] = [
  { key: "home", label: "Accueil", href: "/", icon: "home-outline", iconActive: "home" },
  {
    key: "setup",
    label: "Trajet",
    href: "/setup",
    icon: "navigate-outline",
    iconActive: "navigate"
  },
  {
    key: "messages",
    label: "Messages",
    href: "/messages",
    icon: "chatbubble-ellipses-outline",
    iconActive: "chatbubble-ellipses"
  },
  {
    key: "favorites",
    label: "Favoris",
    href: "/favorites",
    icon: "heart-outline",
    iconActive: "heart"
  },
  {
    key: "account",
    label: "Compte",
    href: "/account",
    icon: "person-outline",
    iconActive: "person"
  }
];

function TabButton(props: { item: TabItem; active: boolean; onPress: () => void }) {
  const { item, active, onPress } = props;
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [active, progress]);

  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08]
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -2]
  });
  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1]
  });
  const color = active ? "#111827" : "#64748B";

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ flex: 1, alignItems: "center", paddingVertical: 6 }}
      accessibilityRole="button"
    >
      <Animated.View style={{ alignItems: "center", transform: [{ scale }, { translateY }] }}>
        <Ionicons name={active ? item.iconActive : item.icon} size={20} color={color} />
        {item.badgeCount && item.badgeCount > 0 ? (
          <View
            style={{
              position: "absolute",
              top: -5,
              right: -10,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: "#DC2626",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 3
            }}
          >
            <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>
              {item.badgeCount > 99 ? "99+" : item.badgeCount}
            </Text>
          </View>
        ) : null}
        <Text style={{ marginTop: 4, fontSize: 11, fontWeight: "600", color }}>
          {item.label}
        </Text>
        <Animated.View
          style={{
            marginTop: 4,
            height: 2,
            width: 18,
            borderRadius: 2,
            backgroundColor: "#111827",
            opacity
          }}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function MainLayout() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [unreadCount, setUnreadCount] = useState(0);
  const [online, setOnline] = useState<boolean>(true);
  const [pendingQuickHref, setPendingQuickHref] = useState<string | null>(null);

  useEffect(() => {
    // Les quick actions peuvent arriver avant que le navigateur soit prêt: on met en file d'attente.
    const queueIfRouterAction = (action: QuickActions.Action | undefined) => {
      if (!action || !isRouterAction(action)) return;
      const href = action.params?.href;
      if (typeof href !== "string" || href.length === 0) return;
      setPendingQuickHref(href);
    };

    queueIfRouterAction(QuickActions.initial);
    const sub = QuickActions.addListener((action) => {
      queueIfRouterAction(action);
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!pendingQuickHref) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const tryNavigate = (attempt: number) => {
      if (cancelled) return;
      try {
        router.push(pendingQuickHref as any);
        setPendingQuickHref(null);
      } catch (error) {
        const message = String((error as { message?: string })?.message ?? "");
        const isNavigationContextError = message.toLowerCase().includes("navigation context");
        // Certains appareils déclenchent l'action rapide avant l'initialisation du container.
        // On retente quelques fois sans casser le rendu global.
        if (isNavigationContextError && attempt < 8) {
          retryTimer = setTimeout(() => tryNavigate(attempt + 1), 120);
          return;
        }
        console.log("[quick-actions] navigation delayed/failed", {
          attempt: attempt + 1,
          message
        });
        setPendingQuickHref(null);
      }
    };

    retryTimer = setTimeout(() => tryNavigate(0), 0);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [pendingQuickHref]);

  const ensurePushNotificationsConsent = async (): Promise<any> => {
    if (Constants.appOwnership === "expo") return null;

    const notificationsApi = await import("expo-notifications");
    const permission = await notificationsApi.getPermissionsAsync();
    if (permission.granted) {
      await AsyncStorage.setItem(PUSH_CONSENT_KEY, "granted");
      return notificationsApi;
    }

    const savedChoice = await AsyncStorage.getItem(PUSH_CONSENT_KEY);
    if (savedChoice === "denied") {
      return null;
    }

    const approved = await confirmAction({
      title: "Activer les notifications ?",
      message:
        "SafeBack peut t'alerter en direct (messages, demandes de vérification, confirmations d'arrivée).",
      confirmLabel: "Autoriser"
    });

    if (!approved) {
      await AsyncStorage.setItem(PUSH_CONSENT_KEY, "denied");
      return null;
    }

    const requested = await notificationsApi.requestPermissionsAsync();
    if (requested.granted) {
      await AsyncStorage.setItem(PUSH_CONSENT_KEY, "granted");
      return notificationsApi;
    }
    await AsyncStorage.setItem(PUSH_CONSENT_KEY, "denied");
    return null;
  };

  useEffect(() => {
    let mounted = true;
    Network.getNetworkStateAsync()
      .then((state) => {
        if (!mounted) return;
        setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
      })
      .catch(() => {
        if (!mounted) return;
        setOnline(false);
      });
    const sub = Network.addNetworkStateListener((state) => {
      setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let channel: any = null;
    let notificationsApi: any = null;

    const clearRuntime = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };

    const refreshUnread = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.user || cancelled) {
          if (!cancelled) {
            setUnreadCount(0);
          }
          return;
        }
        const count = await getUnreadNotificationsCount();
        if (!cancelled) {
          setUnreadCount(count);
        }
      } catch {
        if (!cancelled) {
          setUnreadCount(0);
        }
      }
    };

    const startRuntime = async () => {
      clearRuntime();
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId || cancelled) {
        if (!cancelled) {
          setUnreadCount(0);
        }
        return;
      }

      await refreshUnread();
      interval = setInterval(refreshUnread, 15000);

      try {
        notificationsApi = await ensurePushNotificationsConsent();
      } catch {
        notificationsApi = null;
      }

      channel = supabase
        .channel(`app-notifications-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "app_notifications",
            filter: `user_id=eq.${userId}`
          },
          async (payload: any) => {
            if (cancelled) return;
            setUnreadCount((prev) => prev + 1);
            try {
              if (!notificationsApi) return;
              const permissions = await notificationsApi.getPermissionsAsync();
              if (!permissions.granted) return;
              await notificationsApi.scheduleNotificationAsync({
                content: {
                  title: String(payload.new?.title ?? "Nouvelle notification"),
                  body: String(payload.new?.body ?? ""),
                  data: {
                    notificationId: String(payload.new?.id ?? "")
                  }
                },
                trigger: null
              });
            } catch {
              // no-op : une erreur locale ne doit pas interrompre l'abonnement temps réel.
            }
          }
        )
        .subscribe();
    };

    startRuntime();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      if (cancelled) return;
      startRuntime();
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      clearRuntime();
    };
  }, [setUnreadCount]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.user) {
          setUnreadCount(0);
          return;
        }
        const count = await getUnreadNotificationsCount();
        setUnreadCount(count);
      } catch {
        setUnreadCount(0);
      }
    })();
  }, [pathname, setUnreadCount]);

  const activeHref = useMemo(() => {
    if (pathname === "/") return "/";
    const match = TABS.find((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`));
    return match?.href ?? "/";
  }, [pathname]);

  const tabsWithBadges = useMemo(
    () =>
      TABS.map((tab) =>
        tab.key === "messages"
          ? {
              ...tab,
              badgeCount: unreadCount
            }
          : tab
      ),
    [unreadCount]
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Garde un navigateur dédié au groupe "(main)" pour garantir le contexte de navigation des écrans enfants. */}
      <Stack screenOptions={{ headerShown: false }} />
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: "#E7E0D7",
          backgroundColor: "#F7F2EA",
          paddingBottom: insets.bottom
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-around",
            paddingVertical: 8
          }}
        >
          {tabsWithBadges.map((tab) => {
            const active = activeHref === tab.href;
            return (
              <TabButton
                key={tab.key}
                item={tab}
                active={active}
                onPress={() => {
                  if (!active) {
                    router.push(tab.href);
                  }
                }}
              />
            );
          })}
        </View>
        {unreadCount > 0 ? (
          <View
            style={{
              position: "absolute",
              right: 14,
              top: -52
            }}
          >
            <TouchableOpacity
              onPress={() => router.push("/notifications")}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "#CBD5E1",
                shadowColor: "#0F172A",
                shadowOpacity: 0.12,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: 5
              }}
            >
              <Ionicons name="notifications-outline" size={20} color="#0F172A" />
              <View
                style={{
                  position: "absolute",
                  top: -3,
                  right: -3,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: "#DC2626",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 3
                }}
              >
                <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : null}
        <View
          style={{
            position: "absolute",
            left: 14,
            top: -34,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: online ? "#86EFAC" : "#FCA5A5",
            backgroundColor: "#FFFFFF"
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: online ? "#16A34A" : "#DC2626",
              marginRight: 6
            }}
          />
          <Text style={{ fontSize: 10, fontWeight: "700", color: online ? "#166534" : "#991B1B" }}>
            {online ? "En ligne" : "Hors ligne"}
          </Text>
        </View>
      </View>
    </View>
  );
}
