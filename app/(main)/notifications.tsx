import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect } from "expo-router";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  getUnreadNotificationsCount,
  listAppNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification
} from "../../src/lib/messagingDb";
import { supabase } from "../../src/lib/supabase";

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month} ${hours}:${minutes}`;
}

function notificationStyle(type: string) {
  const normalized = String(type || "").toLowerCase();
  if (normalized.includes("arrival")) {
    return {
      icon: "checkmark-done-circle-outline" as const,
      tone: "text-emerald-700",
      bg: "bg-emerald-50"
    };
  }
  if (normalized.includes("guardian")) {
    return {
      icon: "shield-checkmark-outline" as const,
      tone: "text-sky-700",
      bg: "bg-sky-50"
    };
  }
  if (normalized.includes("message")) {
    return {
      icon: "chatbubble-ellipses-outline" as const,
      tone: "text-indigo-700",
      bg: "bg-indigo-50"
    };
  }
  return {
    icon: "notifications-outline" as const,
    tone: "text-slate-700",
    bg: "bg-slate-100"
  };
}

export default function NotificationsScreen() {
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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

  const refresh = async () => {
    const [rows, unread] = await Promise.all([listAppNotifications(80), getUnreadNotificationsCount()]);
    setNotifications(rows);
    setUnreadCount(unread);
  };

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setLoading(true);
        setErrorMessage("");
        await refresh();
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement des notifications.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-center-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "app_notifications",
          filter: `user_id=eq.${userId}`
        },
        async () => {
          try {
            await refresh();
          } catch {
            // no-op
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

  const summaryText = useMemo(() => {
    if (unreadCount <= 0) return "Aucune notification non lue.";
    if (unreadCount === 1) return "1 notification non lue.";
    return `${unreadCount} notifications non lues.`;
  }, [unreadCount]);

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <View className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-[#FAD4A6] opacity-70" />
      <View className="absolute top-32 -left-28 h-72 w-72 rounded-full bg-[#BFE9D6] opacity-60" />
      <View className="absolute bottom-24 -right-32 h-72 w-72 rounded-full bg-[#C7DDF8] opacity-40" />

      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="mt-6 flex-row items-center justify-between">
          <View className="rounded-full bg-[#111827] px-3 py-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">
              Notifications
            </Text>
          </View>
          <TouchableOpacity
            className={`rounded-full border px-4 py-2 ${
              unreadCount > 0 ? "border-emerald-200 bg-emerald-50" : "border-[#E7E0D7] bg-white/90"
            }`}
            onPress={async () => {
              try {
                setBusy(true);
                setErrorMessage("");
                await markAllNotificationsRead();
                await refresh();
              } catch (error: any) {
                setErrorMessage(error?.message ?? "Impossible de marquer les notifications.");
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy || unreadCount === 0}
          >
            <Text
              className={`text-xs font-semibold uppercase tracking-widest ${
                unreadCount > 0 ? "text-emerald-800" : "text-slate-500"
              }`}
            >
              Tout lire
            </Text>
          </TouchableOpacity>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Centre d alertes</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Nouveau message, confirmation d arrivee et assignation garant.
        </Text>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Resume</Text>
          <Text className="mt-2 text-2xl font-extrabold text-[#0F172A]">{unreadCount}</Text>
          <Text className="mt-1 text-sm text-slate-600">{summaryText}</Text>
          <TouchableOpacity
            className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
            onPress={async () => {
              try {
                setLoading(true);
                setErrorMessage("");
                await refresh();
              } catch (error: any) {
                setErrorMessage(error?.message ?? "Impossible d actualiser.");
              } finally {
                setLoading(false);
              }
            }}
            disabled={busy || loading}
          >
            <Text className="text-center text-sm font-semibold text-slate-700">Actualiser</Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Historique</Text>
          {loading ? (
            <View className="mt-4 flex-row items-center">
              <ActivityIndicator size="small" color="#334155" />
              <Text className="ml-2 text-sm text-slate-600">Chargement...</Text>
            </View>
          ) : notifications.length === 0 ? (
            <Text className="mt-4 text-sm text-slate-500">Aucune notification pour le moment.</Text>
          ) : (
            notifications.map((item) => {
              const style = notificationStyle(item.notification_type);
              const unread = !item.read_at;
              return (
                <TouchableOpacity
                  key={item.id}
                  className={`mt-3 rounded-2xl border px-4 py-4 ${
                    unread ? "border-[#D9D3CA] bg-white" : "border-slate-100 bg-slate-50"
                  }`}
                  onPress={async () => {
                    if (item.read_at) return;
                    try {
                      setBusy(true);
                      await markNotificationRead(item.id);
                      await refresh();
                    } catch (error: any) {
                      setErrorMessage(error?.message ?? "Impossible de marquer comme lu.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <View className="flex-row items-start">
                    <View className={`rounded-xl px-2 py-2 ${style.bg}`}>
                      <Ionicons name={style.icon} size={18} color="#0f172a" />
                    </View>
                    <View className="ml-3 flex-1">
                      <View className="flex-row items-center justify-between">
                        <Text className={`text-sm font-semibold ${unread ? "text-slate-900" : "text-slate-700"}`}>
                          {item.title}
                        </Text>
                        {unread ? <View className="h-2 w-2 rounded-full bg-rose-500" /> : null}
                      </View>
                      <Text className="mt-1 text-sm text-slate-600">{item.body}</Text>
                      <Text className={`mt-2 text-xs ${style.tone}`}>{formatDateTime(item.created_at)}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {errorMessage ? <Text className="mt-4 text-sm text-red-600">{errorMessage}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
