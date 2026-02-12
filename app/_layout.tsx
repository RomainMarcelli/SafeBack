import "../global.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Slot, usePathname, useRouter } from "expo-router";
import { Animated, Easing, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { enableFreeze, enableScreens } from "react-native-screens";
import { startForgottenTripDetector } from "../src/services/forgottenTripDetector";
import { supabase } from "../src/lib/supabase";
import { getUnreadNotificationsCount } from "../src/lib/messagingDb";

if (Constants.appOwnership === "expo") {
  enableScreens(false);
  enableFreeze(false);
}

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

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [unreadCount, setUnreadCount] = useState(0);
  const hideTabs = pathname === "/auth" || pathname === "/signup" || pathname === "/friend-view";

  useEffect(() => {
    let stopDetector: (() => void) | null = null;
    let cancelled = false;
    const ensureStopped = () => {
      if (stopDetector) {
        stopDetector();
        stopDetector = null;
      }
    };
    const ensureStarted = async () => {
      ensureStopped();
      const stop = await startForgottenTripDetector();
      if (cancelled) {
        stop();
        return;
      }
      stopDetector = stop;
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

      if (Constants.appOwnership !== "expo") {
        try {
          notificationsApi = await import("expo-notifications");
          const permissions = await notificationsApi.getPermissionsAsync();
          if (!permissions.granted) {
            await notificationsApi.requestPermissionsAsync();
          }
        } catch {
          notificationsApi = null;
        }
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
              // no-op: local notifications may be unavailable (Expo Go / denied permissions)
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
      <Slot />
      {!hideTabs ? (
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
          <View
            style={{
              position: "absolute",
              right: 20,
              top: -38
            }}
          >
            <TouchableOpacity
              onPress={() => router.push("/notifications")}
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                backgroundColor: "#67E8F9",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "#A5F3FC"
              }}
            >
              <Ionicons name="notifications-outline" size={21} color="#0C4A6E" />
              {unreadCount > 0 ? (
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
              ) : null}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}
