import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Redirect, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  getUnreadNotificationsCount,
  listAppNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  respondFriendWellbeingPing,
  type AppNotification
} from "../../src/lib/social/messagingDb";
import { respondToFriendRequest } from "../../src/lib/social/friendsDb";
import { supabase } from "../../src/lib/core/supabase";

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
  if (normalized.includes("wellbeing") || normalized.includes("ping")) {
    return {
      icon: "pulse-outline" as const,
      tone: "text-cyan-700",
      bg: "bg-cyan-50"
    };
  }
  if (normalized.includes("friend")) {
    return {
      icon: "people-outline" as const,
      tone: "text-fuchsia-700",
      bg: "bg-fuchsia-50"
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

function getFriendRequestId(notification: AppNotification): string | null {
  const data = notification.data as Record<string, unknown> | null | undefined;
  if (!data) return null;
  const value = data.friend_request_id;
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return null;
}

function getPingId(notification: AppNotification): string | null {
  const data = notification.data as Record<string, unknown> | null | undefined;
  if (!data) return null;
  const value = data.ping_id;
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return null;
}

export default function NotificationsScreen() {
  const router = useRouter();
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
            // no-op : on ignore un échec ponctuel, la prochaine notification relancera le refresh.
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
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              className="rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
              onPress={() => router.back()}
            >
              <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">
                Retour
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
              onPress={() => router.replace("/")}
            >
              <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">
                Accueil
              </Text>
            </TouchableOpacity>
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

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Centre d'alertes</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Nouveau message, confirmation d'arrivée et assignation garant.
        </Text>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Résumé</Text>
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
                setErrorMessage(error?.message ?? "Impossible d'actualiser.");
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

                      {item.notification_type === "friend_request_received" && !item.read_at ? (
                        <View className="mt-3 flex-row gap-2">
                          <TouchableOpacity
                            className="flex-1 rounded-xl bg-emerald-600 px-3 py-2"
                            onPress={async () => {
                              const requestId = getFriendRequestId(item);
                              if (!requestId) return;
                              try {
                                setBusy(true);
                                setErrorMessage("");
                                await respondToFriendRequest({ requestId, accept: true });
                                await markNotificationRead(item.id);
                                await refresh();
                              } catch (error: any) {
                                setErrorMessage(error?.message ?? "Impossible d'accepter la demande.");
                              } finally {
                                setBusy(false);
                              }
                            }}
                            disabled={busy}
                          >
                            <Text className="text-center text-xs font-semibold text-white">Accepter</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2"
                            onPress={async () => {
                              const requestId = getFriendRequestId(item);
                              if (!requestId) return;
                              try {
                                setBusy(true);
                                setErrorMessage("");
                                await respondToFriendRequest({ requestId, accept: false, autoOpenConversation: false });
                                await markNotificationRead(item.id);
                                await refresh();
                              } catch (error: any) {
                                setErrorMessage(error?.message ?? "Impossible de refuser la demande.");
                              } finally {
                                setBusy(false);
                              }
                            }}
                            disabled={busy}
                          >
                            <Text className="text-center text-xs font-semibold text-slate-700">Refuser</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}

                      {item.notification_type === "friend_wellbeing_ping" && !item.read_at ? (
                        <View className="mt-3 flex-row gap-2">
                          <TouchableOpacity
                            className="flex-1 rounded-xl bg-emerald-600 px-3 py-2"
                            onPress={async () => {
                              const pingId = getPingId(item);
                              if (!pingId) return;
                              try {
                                setBusy(true);
                                setErrorMessage("");
                                await respondFriendWellbeingPing({ pingId, arrived: true });
                                await markNotificationRead(item.id);
                                await refresh();
                              } catch (error: any) {
                                setErrorMessage(error?.message ?? "Impossible d'envoyer la reponse.");
                              } finally {
                                setBusy(false);
                              }
                            }}
                            disabled={busy}
                          >
                            <Text className="text-center text-xs font-semibold text-white">Oui, bien arrive</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2"
                            onPress={async () => {
                              const pingId = getPingId(item);
                              if (!pingId) return;
                              try {
                                setBusy(true);
                                setErrorMessage("");
                                await respondFriendWellbeingPing({ pingId, arrived: false });
                                await markNotificationRead(item.id);
                                await refresh();
                              } catch (error: any) {
                                setErrorMessage(error?.message ?? "Impossible d'envoyer la reponse.");
                              } finally {
                                setBusy(false);
                              }
                            }}
                            disabled={busy}
                          >
                            <Text className="text-center text-xs font-semibold text-slate-700">Non, pas encore</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
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
