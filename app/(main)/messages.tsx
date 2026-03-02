import { useEffect, useMemo, useRef, useState } from "react";
import { Audio } from "expo-av";
import { StatusBar } from "expo-status-bar";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  ensureDirectConversation,
  listConversationMessages,
  listConversationParticipants,
  listConversations,
  sendConversationMessage,
  type Conversation,
  type ConversationMessage,
  type ConversationParticipant
} from "../../src/lib/social/messagingDb";
import { getPublicProfilesByUserIds, type PublicProfile } from "../../src/lib/social/friendsDb";
import { startVoiceRecording, stopVoiceRecording, uploadVoiceDraft, type VoiceDraft } from "../../src/lib/social/voiceNotes";
import { supabase } from "../../src/lib/core/supabase";
import { FeedbackMessage } from "../../src/components/FeedbackMessage";
import { getThemeMode, type ThemeMode } from "../../src/lib/theme/themePreferences";
import { PremiumEmptyState } from "../../src/components/ui/PremiumEmptyState";
import { SkeletonCard } from "../../src/components/ui/Skeleton";

function formatTime(value?: string | null) {
  if (!value) return "--:--";
  const date = new Date(value);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDuration(ms?: number | null) {
  const seconds = Math.max(0, Math.round((ms ?? 0) / 1000));
  const min = Math.floor(seconds / 60);
  const sec = String(seconds % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function labelFromProfile(profile?: PublicProfile | null, fallbackId?: string | null) {
  const firstName = String(profile?.first_name ?? "").trim();
  if (firstName) return firstName;
  const fullName = `${String(profile?.first_name ?? "").trim()} ${String(profile?.last_name ?? "").trim()}`.trim();
  if (fullName) return fullName;
  const username = String(profile?.username ?? "").trim();
  if (username) return username;
  if (profile?.public_id) return `ID ${profile.public_id}`;
  if (!fallbackId) return "Conversation";
  return `ID ${fallbackId.slice(0, 8)}`;
}

function VoiceMessagePlayer(props: {
  uri: string;
  durationMs?: number | null;
  mine: boolean;
  compact?: boolean;
}) {
  const { uri, durationMs, mine, compact = false } = props;
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [internalDurationMs, setInternalDurationMs] = useState(durationMs ?? 0);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync().catch(() => {
          // no-op
        });
      }
    };
  }, [sound]);

  const resolvedDuration = Math.max(internalDurationMs, durationMs ?? 0, 1);
  const progress = Math.max(0, Math.min(1, positionMs / resolvedDuration));

  const onPress = async () => {
    try {
      if (!sound) {
        const { sound: createdSound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          (status) => {
            if (!status.isLoaded) return;
            setPositionMs(status.positionMillis ?? 0);
            setInternalDurationMs(status.durationMillis ?? resolvedDuration);
            setPlaying(Boolean(status.isPlaying));
            if (status.didJustFinish) {
              setPlaying(false);
              setPositionMs(0);
            }
          }
        );
        setSound(createdSound);
        setPlaying(true);
        return;
      }

      const status = await sound.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) {
        await sound.pauseAsync();
        setPlaying(false);
      } else {
        await sound.playAsync();
        setPlaying(true);
      }
    } catch {
      setPlaying(false);
    }
  };

  return (
    <TouchableOpacity
      className={`rounded-2xl border px-3 ${compact ? "py-2" : "py-3"} ${
        mine ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"
      }`}
      onPress={onPress}
    >
      <View className="flex-row items-center gap-2">
        <Ionicons name={playing ? "pause" : "play"} size={16} color={mine ? "#E2E8F0" : "#0F172A"} />
        <View className={`h-1.5 flex-1 overflow-hidden rounded-full ${mine ? "bg-slate-600" : "bg-slate-200"}`}>
          <View
            className={`h-full rounded-full ${mine ? "bg-cyan-300" : "bg-cyan-600"}`}
            style={{ width: `${progress * 100}%` }}
          />
        </View>
        <Text className={`text-xs font-semibold ${mine ? "text-slate-200" : "text-slate-700"}`}>
          {formatDuration(playing ? positionMs : resolvedDuration)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function MessagesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const preferredConversationFromParams =
    typeof params.conversationId === "string" && params.conversationId.trim().length > 0
      ? params.conversationId
      : null;

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [participantsByConversation, setParticipantsByConversation] = useState<
    Record<string, ConversationParticipant[]>
  >({});
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, PublicProfile>>({});
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [textMessage, setTextMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null);

  const threadRef = useRef<ScrollView | null>(null);

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
    getThemeMode()
      .then(setThemeMode)
      .catch(() => setThemeMode("light"));
  }, []);

  useEffect(() => {
    if (!recordingStartedAt) {
      setRecordingElapsedMs(0);
      return;
    }
    const timer = setInterval(() => {
      setRecordingElapsedMs(Date.now() - recordingStartedAt);
    }, 250);
    return () => clearInterval(timer);
  }, [recordingStartedAt]);

  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {
          // no-op
        });
      }
    };
  }, [recording]);

  const loadConversations = async (preferredConversationId?: string | null) => {
    const rows = await listConversations();
    const participantsPairs = await Promise.all(
      rows.map(async (conversation) => {
        const participants = await listConversationParticipants(conversation.id);
        return [conversation.id, participants] as const;
      })
    );
    const participantsMap = Object.fromEntries(participantsPairs);
    setParticipantsByConversation(participantsMap);
    setConversations(rows);

    const uniqueUserIds = [...new Set(participantsPairs.flatMap(([, participants]) => participants.map((p) => p.user_id)))];
    if (uniqueUserIds.length > 0) {
      const profiles = await getPublicProfilesByUserIds(uniqueUserIds);
      setProfilesByUserId(Object.fromEntries(profiles.map((profile) => [profile.user_id, profile])));
    } else {
      setProfilesByUserId({});
    }

    const targetConversationId =
      preferredConversationId ?? selectedConversationId ?? (rows.length > 0 ? rows[0].id : null);

    if (targetConversationId && !rows.some((row) => row.id === targetConversationId)) {
      setSelectedConversationId(rows.length > 0 ? rows[0].id : null);
      return rows.length > 0 ? rows[0].id : null;
    }

    setSelectedConversationId(targetConversationId);
    return targetConversationId;
  };

  const loadMessages = async (conversationId: string | null) => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    const rows = await listConversationMessages(conversationId);
    setMessages(rows);
  };

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setLoading(true);
        setErrorMessage("");
        const conversationId = await loadConversations(preferredConversationFromParams);
        await loadMessages(conversationId);
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement de la messagerie.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, preferredConversationFromParams]);

  useEffect(() => {
    if (!preferredConversationFromParams) return;
    if (!conversations.some((conversation) => conversation.id === preferredConversationFromParams)) return;
    setSelectedConversationId(preferredConversationFromParams);
    loadMessages(preferredConversationFromParams).catch(() => {
      // no-op
    });
  }, [preferredConversationFromParams, conversations]);

  useEffect(() => {
    if (!selectedConversationId) return;
    const channel = supabase
      .channel(`messages-${selectedConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${selectedConversationId}`
        },
        async () => {
          try {
            await Promise.all([
              loadMessages(selectedConversationId),
              loadConversations(selectedConversationId)
            ]);
          } catch {
            // no-op
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConversationId]);

  const shouldRedirectToAuth = !checking && !userId;
  const darkMode = themeMode === "dark";

  const conversationItems = useMemo(() => {
    return conversations.map((conversation) => {
      const participants = participantsByConversation[conversation.id] ?? [];
      const peer = participants.find((participant) => participant.user_id !== userId);
      const profile = peer ? profilesByUserId[peer.user_id] : undefined;
      return {
        id: conversation.id,
        peerUserId: peer?.user_id ?? null,
        label: labelFromProfile(profile, peer?.user_id),
        lastMessageAt: conversation.last_message_at ?? conversation.updated_at
      };
    });
  }, [conversations, participantsByConversation, profilesByUserId, userId]);

  const selectedConversationMeta = conversationItems.find(
    (conversation) => conversation.id === selectedConversationId
  );

  const sendText = async () => {
    if (!selectedConversationId || !textMessage.trim()) return;
    try {
      setBusy(true);
      setErrorMessage("");
      setSuccessMessage("");
      await sendConversationMessage({
        conversationId: selectedConversationId,
        messageType: "text",
        body: textMessage.trim()
      });
      setTextMessage("");
      await Promise.all([loadMessages(selectedConversationId), loadConversations(selectedConversationId)]);
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d'envoyer le message.");
    } finally {
      setBusy(false);
    }
  };

  const startRecordingVoice = async () => {
    if (!selectedConversationId) {
      setErrorMessage("Choisis d'abord une conversation pour envoyer un vocal.");
      return;
    }
    try {
      setErrorMessage("");
      setSuccessMessage("");
      const nextRecording = await startVoiceRecording();
      setRecording(nextRecording);
      setRecordingStartedAt(Date.now());
      setVoiceDraft(null);
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible de démarrer l'enregistrement.");
    }
  };

  const stopRecordingVoice = async () => {
    if (!recording) return;
    try {
      setBusy(true);
      const draft = await stopVoiceRecording(recording);
      setRecording(null);
      setRecordingStartedAt(null);
      if (draft.durationMs < 150) {
        setErrorMessage("Vocal trop court. Réessaie en parlant un peu plus longtemps.");
        return;
      }
      setVoiceDraft(draft);
      setSuccessMessage("Vocal prêt à être envoyé.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible de finaliser l'enregistrement.");
    } finally {
      setBusy(false);
    }
  };

  const cancelRecording = async () => {
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
    } catch {
      // no-op
    }
    setRecording(null);
    setRecordingStartedAt(null);
    setRecordingElapsedMs(0);
  };

  const sendVoice = async () => {
    if (!selectedConversationId || !voiceDraft) return;
    try {
      setBusy(true);
      setErrorMessage("");
      setSuccessMessage("");
      const uploaded = await uploadVoiceDraft({
        uri: voiceDraft.uri,
        conversationId: selectedConversationId,
        durationMs: voiceDraft.durationMs
      });
      await sendConversationMessage({
        conversationId: selectedConversationId,
        messageType: "voice",
        body: null,
        voiceUrl: uploaded.voiceUrl,
        durationMs: uploaded.durationMs,
        metadata: {
          provider: "expo-av",
          format: "m4a"
        }
      });
      setVoiceDraft(null);
      await Promise.all([loadMessages(selectedConversationId), loadConversations(selectedConversationId)]);
      setSuccessMessage("Vocal envoyé.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d'envoyer le vocal.");
    } finally {
      setBusy(false);
    }
  };

  const openConversationFromFriendScreen = async () => {
    router.push("/friends");
  };

  if (shouldRedirectToAuth) {
    return <Redirect href="/auth" />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: darkMode ? "#0B1220" : "#F7F2EA" }}>
      <StatusBar style={darkMode ? "light" : "dark"} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        // Le footer personnalisé occupe de la place: on augmente l'offset pour garder le champ visible.
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom + 106 : 0}
      >
      <View className="flex-1 px-4 pb-4">
        <View className="mt-4 flex-row items-center justify-between">
          <View>
            <Text className={`text-[11px] font-semibold uppercase tracking-[2px] ${darkMode ? "text-slate-300" : "text-slate-500"}`}>Messagerie</Text>
            <Text className={`mt-1 text-2xl font-extrabold ${darkMode ? "text-slate-100" : "text-[#0F172A]"}`}>Conversations</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              className="rounded-full border border-[#E7E0D7] bg-white px-4 py-2"
              onPress={openConversationFromFriendScreen}
            >
              <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">Amis</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="rounded-full border border-[#E7E0D7] bg-white p-2"
              onPress={async () => {
                try {
                  setLoading(true);
                  const conversationId = await loadConversations(selectedConversationId);
                  await loadMessages(conversationId);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading || busy}
            >
              <Ionicons name="refresh" size={16} color="#334155" />
            </TouchableOpacity>
          </View>
        </View>

        <View className="mt-3 rounded-2xl border border-[#E7E0D7] bg-white/90 px-3 py-3">
          {loading ? (
            <View className="gap-2 py-1">
              <SkeletonCard />
            </View>
          ) : conversationItems.length === 0 ? (
            <View className="py-1">
              <PremiumEmptyState
                title="Aucune conversation"
                description="Commence depuis la page Amis pour ouvrir un fil de discussion."
                icon="chatbubble-ellipses-outline"
                actionLabel="Ouvrir mes amis"
                onActionPress={openConversationFromFriendScreen}
              />
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {conversationItems.map((item) => {
                  const active = item.id === selectedConversationId;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      className={`rounded-2xl px-4 py-3 ${active ? "bg-[#0F172A]" : "border border-slate-200 bg-slate-50"}`}
                      onPress={() => {
                        setSelectedConversationId(item.id);
                        loadMessages(item.id).catch(() => {
                          // no-op
                        });
                      }}
                    >
                      <Text className={`text-sm font-semibold ${active ? "text-white" : "text-slate-800"}`}>{item.label}</Text>
                      <Text className={`mt-1 text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>
                        {formatTime(item.lastMessageAt)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>

        <View className="mt-3 flex-1 overflow-hidden rounded-3xl border border-[#D9D3CA] bg-white shadow-sm">
          <View className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <Text className="text-xs uppercase tracking-widest text-slate-500">Fil de discussion</Text>
            <Text className="mt-1 text-sm font-semibold text-slate-900">
              {selectedConversationMeta?.label ?? "Sélectionne une conversation"}
            </Text>
          </View>

          <ScrollView
            ref={threadRef}
            className="flex-1 bg-[#F8FAFC] px-3 py-3"
            contentContainerStyle={{ paddingBottom: 12 }}
            onContentSizeChange={() => threadRef.current?.scrollToEnd({ animated: true })}
          >
            {!selectedConversationId ? (
              <PremiumEmptyState
                title="Choisis une conversation"
                description="Sélectionne un fil en haut pour afficher les messages."
                icon="chatbubble-outline"
              />
            ) : messages.length === 0 ? (
              <PremiumEmptyState
                title="Aucun message"
                description="Envoie le premier message pour démarrer la discussion."
                icon="paper-plane-outline"
              />
            ) : (
              messages.map((message) => {
                const mine = message.sender_user_id === userId;
                const isVoice = message.message_type === "voice";
                const isArrival = message.message_type === "arrival";
                const eventType = String(
                  (message.metadata as Record<string, unknown> | null)?.event_type ?? ""
                );
                const isSosMessage =
                  eventType === "sos_alert" ||
                  (message.message_type === "system" &&
                    String(message.body ?? "").toLowerCase().includes("je suis en danger"));

                return (
                  <View
                    key={message.id}
                    className={`mb-2 max-w-[88%] rounded-2xl px-3 py-2 ${
                      isSosMessage
                        ? mine
                          ? "self-end bg-rose-600"
                          : "self-start border border-rose-200 bg-rose-50"
                        : isArrival
                          ? mine
                            ? "self-end bg-emerald-600"
                            : "self-start border border-emerald-200 bg-emerald-50"
                        : mine
                          ? "self-end bg-[#111827]"
                          : "self-start border border-slate-200 bg-white"
                    }`}
                  >
                    <Text
                      className={`text-[10px] font-semibold uppercase tracking-[1.5px] ${
                        isSosMessage
                          ? mine
                            ? "text-rose-100"
                            : "text-rose-700"
                          : isArrival
                            ? mine
                              ? "text-emerald-100"
                              : "text-emerald-700"
                            : mine
                              ? "text-slate-400"
                              : "text-slate-500"
                      }`}
                    >
                      {isSosMessage
                        ? "SOS"
                        : isArrival
                          ? "Arrivée"
                          : isVoice
                            ? "Vocal"
                            : mine
                              ? "Moi"
                              : selectedConversationMeta?.label ?? "Proche"}
                    </Text>

                    {isVoice && message.voice_url ? (
                      <View className="mt-2">
                        <VoiceMessagePlayer
                          uri={message.voice_url}
                          durationMs={message.duration_ms}
                          mine={mine}
                          compact
                        />
                      </View>
                    ) : null}

                    {message.body ? (
                      <Text
                        className={`mt-2 text-sm ${
                          isSosMessage
                            ? mine
                              ? "text-white"
                              : "text-rose-900"
                            : isArrival
                              ? mine
                                ? "text-white"
                                : "text-emerald-900"
                              : mine
                                ? "text-white"
                                : "text-slate-700"
                        }`}
                      >
                        {message.body}
                      </Text>
                    ) : null}

                    <Text
                      className={`mt-2 text-[11px] ${
                        isSosMessage
                          ? mine
                            ? "text-rose-100"
                            : "text-rose-700"
                          : mine
                            ? "text-slate-400"
                            : "text-slate-500"
                      }`}
                    >
                      {formatTime(message.created_at)}
                    </Text>
                  </View>
                );
              })
            )}
          </ScrollView>

          {recording ? (
            <View className="border-t border-rose-100 bg-rose-50 px-3 py-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-rose-800">Enregistrement... {formatDuration(recordingElapsedMs)}</Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    className="rounded-full border border-rose-200 bg-white px-3 py-2"
                    onPress={cancelRecording}
                  >
                    <Text className="text-xs font-semibold uppercase tracking-widest text-rose-700">Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="rounded-full bg-rose-600 px-3 py-2"
                    onPress={stopRecordingVoice}
                    disabled={busy}
                  >
                    <Text className="text-xs font-semibold uppercase tracking-widest text-white">Stop</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}

          {voiceDraft ? (
            <View className="border-t border-cyan-100 bg-cyan-50 px-3 py-3">
              <Text className="text-xs font-semibold uppercase tracking-widest text-cyan-700">Aperçu vocal</Text>
              <View className="mt-2">
                <VoiceMessagePlayer uri={voiceDraft.uri} durationMs={voiceDraft.durationMs} mine={false} />
              </View>
              <View className="mt-2 flex-row gap-2">
                <TouchableOpacity
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2"
                  onPress={() => setVoiceDraft(null)}
                  disabled={busy}
                >
                  <Text className="text-center text-xs font-semibold uppercase tracking-widest text-slate-700">Supprimer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`flex-1 rounded-2xl px-3 py-2 ${busy ? "bg-slate-300" : "bg-cyan-700"}`}
                  onPress={sendVoice}
                  disabled={busy}
                >
                  <Text className="text-center text-xs font-semibold uppercase tracking-widest text-white">Envoyer le vocal</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <View className="border-t border-slate-100 bg-white px-3 py-3">
            <View className="flex-row items-end gap-2">
              <TextInput
                className="flex-1 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
                placeholder="Écrire un message"
                placeholderTextColor="#94a3b8"
                value={textMessage}
                onChangeText={setTextMessage}
                multiline
              />
              <TouchableOpacity
                className={`h-11 w-11 items-center justify-center rounded-full ${
                  textMessage.trim() && selectedConversationId && !busy ? "bg-[#111827]" : "bg-slate-300"
                }`}
                onPress={sendText}
                disabled={!textMessage.trim() || !selectedConversationId || busy}
              >
                <Ionicons name="send" size={16} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                className={`h-11 w-11 items-center justify-center rounded-full ${
                  !selectedConversationId || busy ? "bg-slate-300" : "bg-cyan-700"
                }`}
                onPress={startRecordingVoice}
                disabled={!selectedConversationId || busy || Boolean(recording)}
              >
                <Ionicons name="mic" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
            <Text className="mt-2 text-xs text-slate-500">
              Texte ou vocal. Les vocaux sont envoyés comme des notes audio réécoutables.
            </Text>
          </View>
        </View>

        {errorMessage ? <FeedbackMessage kind="error" message={errorMessage} compact /> : null}
        {successMessage ? <FeedbackMessage kind="success" message={successMessage} compact /> : null}
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
