// Mode "Accompagnement en direct" : checkpoints, messages pré-remplis et rappel ETA côté proche.
import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../src/lib/core/supabase";
import { listFriends, type FriendWithProfile } from "../../src/lib/social/friendsDb";
import {
  ensureDirectConversation,
  sendConversationMessage,
  sendFriendWellbeingPing
} from "../../src/lib/social/messagingDb";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";
import {
  getLiveCompanionPrefs,
  setLiveCompanionPrefs,
  type LiveCompanionCheckpoint
} from "../../src/lib/safety/liveCompanion";

const QUICK_MESSAGES = [
  "Je suis en mode co-pilote, tout va bien pour toi ?",
  "Checkpoint validé. Donne-moi un signe quand tu peux.",
  "ETA dépassée, je vérifie simplement que tout va bien."
] as const;

const ETA_OPTIONS = [5, 10, 15, 20] as const;

function getFriendLabel(friend: FriendWithProfile): string {
  const username = String(friend.profile?.username ?? "").trim();
  const fullName = `${String(friend.profile?.first_name ?? "").trim()} ${String(
    friend.profile?.last_name ?? ""
  ).trim()}`.trim();
  if (username) return `@${username}`;
  if (fullName) return fullName;
  return friend.profile?.public_id ? `ID ${friend.profile.public_id}` : friend.friend_user_id.slice(0, 8);
}

export default function LiveCompanionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ targetUserId?: string; targetName?: string }>();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [selectedFriendId, setSelectedFriendId] = useState<string>(params.targetUserId ?? "");
  const [checkpoints, setCheckpoints] = useState<LiveCompanionCheckpoint[]>([]);
  const [etaReminderMinutes, setEtaReminderMinutes] = useState(10);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

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
    (async () => {
      try {
        setLoading(true);
        setErrorMessage("");
        const [rows, prefs] = await Promise.all([listFriends(), getLiveCompanionPrefs()]);
        setFriends(rows);
        setCheckpoints(prefs.checkpoints);
        setEtaReminderMinutes(prefs.etaReminderMinutes);

        if (!selectedFriendId && rows.length > 0) {
          setSelectedFriendId(rows[0].friend_user_id);
        }
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Impossible de charger le mode co-pilote.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const progress = useMemo(() => {
    if (checkpoints.length === 0) return 0;
    const done = checkpoints.filter((row) => row.done).length;
    return Math.round((done / checkpoints.length) * 100);
  }, [checkpoints]);

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

  const selectedFriend = friends.find((row) => row.friend_user_id === selectedFriendId);

  const persistPrefs = async (nextCheckpoints: LiveCompanionCheckpoint[], nextEta: number) => {
    const next = await setLiveCompanionPrefs({ checkpoints: nextCheckpoints, etaReminderMinutes: nextEta });
    setCheckpoints(next.checkpoints);
    setEtaReminderMinutes(next.etaReminderMinutes);
  };

  const sendQuickMessage = async (body: string) => {
    if (!selectedFriendId) return;
    try {
      setBusy(true);
      setErrorMessage("");
      const conversationId = await ensureDirectConversation(selectedFriendId);
      await sendConversationMessage({
        conversationId,
        messageType: "text",
        body,
        metadata: {
          event_type: "copilot_message"
        }
      });
      setInfoMessage("Message co-pilote envoyé.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d'envoyér le message.");
    } finally {
      setBusy(false);
    }
  };

  const requestWellbeing = async () => {
    if (!selectedFriendId) return;
    try {
      setBusy(true);
      setErrorMessage("");
      const result = await sendFriendWellbeingPing(selectedFriendId);
      if (result.status === "already_pending") {
        setInfoMessage("Une demande est déjà en'attente.");
      } else {
        setInfoMessage("Demande envoyée: ton proche peut répondre en 1 clic.");
      }
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d'envoyér la demande.");
    } finally {
      setBusy(false);
    }
  };

  const scheduleEtaReminder = async () => {
    try {
      setBusy(true);
      setErrorMessage("");

      if (Constants.appOwnership === "expo") {
        setInfoMessage(
          "Rappel ETA simulé en Expo Go. Utilise un build dev pour la notification native programmée."
        );
        return;
      }

      const Notifications = await import("expo-notifications");
      const perm = await Notifications.getPermissionsAsync();
      let status = perm.status;
      if (status !== "granted") {
        const requested = await Notifications.requestPermissionsAsync();
        status = requested.status;
      }
      if (status !== "granted") {
        setErrorMessage("Notifications refusées sur cet appareil.");
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "SafeBack · Rappel ETA co-pilote",
          body: `Vérifie le checkpoint de ${selectedFriend ? getFriendLabel(selectedFriend) : "ton proche"}.`
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: etaReminderMinutes * 60,
          repeats: false
        }
      });
      setInfoMessage(`Rappel ETA programmé dans ${etaReminderMinutes} min.`);
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible de programmer le rappel ETA.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F7F2EA]">
      <StatusBar style="dark" />
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="mt-6 flex-row items-center justify-between">
          <TouchableOpacity
            className="rounded-full border border-[#E7E0D7] bg-white/90 px-4 py-2"
            onPress={() => router.back()}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">Retour</Text>
          </TouchableOpacity>
          <View className="rounded-full bg-[#111827] px-3 py-1">
            <Text className="text-[10px] font-semibold uppercase tracking-[3px] text-white">Co-pilote</Text>
          </View>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Accompagnement en direct</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Checkpoints, messages rapides et rappel ETA pour suivre un proche en temps réel.
        </Text>

        {loading ? (
          <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5">
            <View className="h-4 w-40 rounded-full bg-slate-200" />
            <View className="mt-3 h-4 w-52 rounded-full bg-slate-200" />
            <View className="mt-3 h-4 w-36 rounded-full bg-slate-200" />
          </View>
        ) : (
          <>
            <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
              <Text className="text-xs uppercase tracking-widest text-slate-500">Proche suivi</Text>
              {friends.length === 0 ? (
                <View className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <Text className="text-sm font-semibold text-amber-800">
                    Aucun proche trouvé. Ajoute d'abord'un'ami dans "Réseau proches".
                  </Text>
                  <TouchableOpacity
                    className="mt-3 rounded-2xl border border-amber-200 bg-white px-4 py-3"
                    onPress={() => router.push("/friends")}
                  >
                    <Text className="text-center text-sm font-semibold text-amber-700">Ouvrir Réseau proches</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View className="mt-3 flex-row flex-wrap gap-2">
                    {friends.map((friend) => {
                      const active = friend.friend_user_id === selectedFriendId;
                      return (
                        <TouchableOpacity
                          key={friend.friend_user_id}
                          className={`rounded-full px-4 py-2 ${
                            active ? "bg-cyan-700" : "border border-slate-200 bg-white"
                          }`}
                          onPress={() => setSelectedFriendId(friend.friend_user_id)}
                        >
                          <Text className={`text-sm font-semibold ${active ? "text-white" : "text-slate-700"}`}>
                            {getFriendLabel(friend)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </View>

            <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs uppercase tracking-widest text-slate-500">Checkpoints</Text>
                <Text className="text-xs font-semibold text-cyan-700">{progress}%</Text>
              </View>
              <View className="mt-2 h-2 overflow-hidden rounded-full bg-cyan-100">
                <View className="h-full rounded-full bg-cyan-600" style={{ width: `${progress}%` }} />
              </View>

              {checkpoints.map((checkpoint) => (
                <TouchableOpacity
                  key={checkpoint.id}
                  className={`mt-3 rounded-2xl border px-4 py-3 ${
                    checkpoint.done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
                  }`}
                  onPress={async () => {
                    const next = checkpoints.map((row) =>
                      row.id === checkpoint.id ? { ...row, done: !row.done } : row
                    );
                    await persistPrefs(next, etaReminderMinutes);
                  }}
                >
                  <Text className={`text-sm font-semibold ${checkpoint.done ? "text-emerald-800" : "text-slate-700"}`}>
                    {checkpoint.done ? "✓ " : "○ "}
                    {checkpoint.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
              <Text className="text-xs uppercase tracking-widest text-slate-500">Rappel ETA</Text>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {ETA_OPTIONS.map((minutes) => {
                  const active = etaReminderMinutes === minutes;
                  return (
                    <TouchableOpacity
                      key={`eta-${minutes}`}
                      className={`rounded-full px-4 py-2 ${
                        active ? "bg-[#111827]" : "border border-slate-200 bg-white"
                      }`}
                      onPress={async () => {
                        await persistPrefs(checkpoints, minutes);
                      }}
                    >
                      <Text className={`text-sm font-semibold ${active ? "text-white" : "text-slate-700"}`}>
                        {minutes} min
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                className={`mt-3 rounded-2xl px-4 py-3 ${busy ? "bg-slate-300" : "bg-cyan-700"}`}
                onPress={scheduleEtaReminder}
                disabled={busy || !selectedFriendId}
              >
                <Text className="text-center text-sm font-semibold text-white">Programmer un rappel ETA</Text>
              </TouchableOpacity>
            </View>

            <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-5 shadow-sm">
              <Text className="text-xs uppercase tracking-widest text-slate-500">Actions rapides</Text>
              <TouchableOpacity
                className={`mt-3 rounded-2xl px-4 py-3 ${busy ? "bg-slate-300" : "bg-emerald-600"}`}
                onPress={requestWellbeing}
                disabled={busy || !selectedFriendId}
              >
                <Text className="text-center text-sm font-semibold text-white">Demander “bien'arrivé ?”</Text>
              </TouchableOpacity>

              {QUICK_MESSAGES.map((message) => (
                <TouchableOpacity
                  key={message}
                  className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  onPress={() => {
                    sendQuickMessage(message).catch(() => {
                      // no-op : erreur affichée par sendQuickMessage.
                    });
                  }}
                  disabled={busy || !selectedFriendId}
                >
                  <Text className="text-sm text-slate-700">{message}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {errorMessage ? <FeedbackMessage kind="error" message={errorMessage} /> : null}
        {infoMessage ? <FeedbackMessage kind="info" message={infoMessage} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
