import "../global.css";
import { useEffect, useMemo, useRef } from "react";
import { Slot, usePathname, useRouter } from "expo-router";
import { Animated, Easing, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { enableFreeze, enableScreens } from "react-native-screens";

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
    key: "favorites",
    label: "Favoris",
    href: "/favorites",
    icon: "heart-outline",
    iconActive: "heart"
  },
  { key: "trips", label: "Historique", href: "/trips", icon: "time-outline", iconActive: "time" },
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
  const hideTabs = pathname === "/auth";

  const activeHref = useMemo(() => {
    if (pathname === "/") return "/";
    const match = TABS.find((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`));
    return match?.href ?? "/";
  }, [pathname]);

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
            {TABS.map((tab) => {
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
        </View>
      ) : null}
    </View>
  );
}
