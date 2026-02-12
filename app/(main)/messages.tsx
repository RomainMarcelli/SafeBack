import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Link, Redirect } from "expo-router";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  createGuardianAssignment,
  ensureDirectConversation,
  listArrivalMessages,
  listConversationMessages,
  listConversationParticipants,
  listConversations,
  sendConversationMessage,
  type Conversation,
  type ConversationMessage,
  type ConversationParticipant
} from "../../src/lib/messagingDb";
import { supabase } from "../../src/lib/supabase";

function formatTime(value?: string | null) {
  if (!value) return "--:--";
  const date = new Date(value);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export default function MessagesScreen() {
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [participantsByConversation, setParticipantsByConversation] = useState<
    Record<string, ConversationParticipant[]>
  >({});
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [arrivalHistory, setArrivalHistory] = useState<ConversationMessage[]>([]);
  const [textMessage, setTextMessage] = useState("");
  const [voiceNote, setVoiceNote] = useState("");
  const [voiceSeconds, setVoiceSeconds] = useState(15);
  const [conversationTarget, setConversationTarget] = useState("");
  const [guardianUserId, setGuardianUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

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

    const targetConversationId =
      preferredConversationId ??
      selectedConversationId ??
      (rows.length > 0 ? rows[0].id : null);
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

  const loadArrivalHistory = async () => {
    const rows = await listArrivalMessages(20);
    setArrivalHistory(rows);
  };

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setLoading(true);
        setErrorMessage("");
        const conversationId = await loadConversations();
        await Promise.all([loadMessages(conversationId), loadArrivalHistory()]);
      } catch (error: any) {
        setErrorMessage(error?.message ?? "Erreur de chargement de la messagerie.");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

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
              loadConversations(selectedConversationId),
              loadArrivalHistory()
            ]);
          } catch {
            // keep previous state
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConversationId]);

  if (!checking && !userId) {
    return <Redirect href="/auth" />;
  }

  const selectedParticipants = selectedConversationId
    ? participantsByConversation[selectedConversationId] ?? []
    : [];

  const selectedPeerId = useMemo(() => {
    if (!selectedParticipants.length || !userId) return null;
    return selectedParticipants.find((item) => item.user_id !== userId)?.user_id ?? null;
  }, [selectedParticipants, userId]);

  const selectedConversationLabel = selectedPeerId
    ? `Chat ${selectedPeerId.slice(0, 8)}`
    : selectedConversationId
    ? `Conversation ${selectedConversationId.slice(0, 6)}`
    : "Aucune conversation";

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
      setErrorMessage(error?.message ?? "Impossible d envoyer le message.");
    } finally {
      setBusy(false);
    }
  };

  const sendVoice = async () => {
    if (!selectedConversationId) return;
    try {
      setBusy(true);
      setErrorMessage("");
      setSuccessMessage("");
      await sendConversationMessage({
        conversationId: selectedConversationId,
        messageType: "voice",
        body: voiceNote.trim() || "Message vocal",
        durationMs: voiceSeconds * 1000,
        metadata: {
          recording: "beta-placeholder"
        }
      });
      setVoiceNote("");
      await Promise.all([
        loadMessages(selectedConversationId),
        loadConversations(selectedConversationId)
      ]);
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d envoyer le vocal.");
    } finally {
      setBusy(false);
    }
  };

  const openDirectConversation = async () => {
    const target = conversationTarget.trim();
    if (!target) return;
    try {
      setBusy(true);
      setErrorMessage("");
      setSuccessMessage("");
      const conversationId = await ensureDirectConversation(target);
      setConversationTarget("");
      await loadConversations(conversationId);
      await loadMessages(conversationId);
      setSuccessMessage("Conversation prete.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d ouvrir la conversation.");
    } finally {
      setBusy(false);
    }
  };

  const assignGuardian = async () => {
    const target = guardianUserId.trim();
    if (!target) return;
    try {
      setBusy(true);
      setErrorMessage("");
      setSuccessMessage("");
      await createGuardianAssignment(target);
      setGuardianUserId("");
      setSuccessMessage("Garant assigne. Une notification lui sera envoyee.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Impossible d assigner ce garant.");
    } finally {
      setBusy(false);
    }
  };

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
              Messagerie
            </Text>
          </View>
          <TouchableOpacity
            className="rounded-full border border-[#E7E0D7] bg-white/90 px-3 py-2"
            onPress={async () => {
              try {
                setLoading(true);
                const conversationId = await loadConversations(selectedConversationId);
                await Promise.all([loadMessages(conversationId), loadArrivalHistory()]);
              } finally {
                setLoading(false);
              }
            }}
            disabled={busy || loading}
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-700">
              Actualiser
            </Text>
          </TouchableOpacity>
        </View>

        <Text className="mt-6 text-4xl font-extrabold text-[#0F172A]">Discussions proches</Text>
        <Text className="mt-2 text-base text-[#475569]">
          Echange par message, envoie un vocal beta, et garde l historique des confirmations.
        </Text>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-4 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Reseau social</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Ajoute des amis, gere les demandes et choisis tes garants depuis un ecran dedie.
          </Text>
          <Link href="/friends" asChild>
            <TouchableOpacity className="mt-3 rounded-2xl bg-[#111827] px-4 py-3">
              <Text className="text-center text-sm font-semibold text-white">Ouvrir la page Amis</Text>
            </TouchableOpacity>
          </Link>
        </View>

        <View className="mt-6 rounded-3xl border border-[#E7E0D7] bg-white/90 p-4 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">
            Ouvrir une conversation directe
          </Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="ID utilisateur du proche"
            placeholderTextColor="#94a3b8"
            value={conversationTarget}
            onChangeText={setConversationTarget}
            autoCapitalize="none"
          />
          <TouchableOpacity
            className={`mt-3 rounded-2xl px-4 py-3 ${
              conversationTarget.trim() && !busy ? "bg-[#111827]" : "bg-slate-300"
            }`}
            onPress={openDirectConversation}
            disabled={!conversationTarget.trim() || busy}
          >
            <Text className="text-center text-sm font-semibold text-white">
              Ouvrir le chat
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-4 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">
            Assigner un garant
          </Text>
          <Text className="mt-2 text-sm text-slate-600">
            La personne sera notifiee en cas de "bien rentre" ou nouveaux messages.
          </Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="ID utilisateur du garant"
            placeholderTextColor="#94a3b8"
            value={guardianUserId}
            onChangeText={setGuardianUserId}
            autoCapitalize="none"
          />
          <TouchableOpacity
            className={`mt-3 rounded-2xl px-4 py-3 ${
              guardianUserId.trim() && !busy ? "bg-[#0F766E]" : "bg-slate-300"
            }`}
            onPress={assignGuardian}
            disabled={!guardianUserId.trim() || busy}
          >
            <Text className="text-center text-sm font-semibold text-white">Assigner garant</Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-4 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Conversations</Text>
          {loading ? (
            <View className="mt-3 flex-row items-center">
              <ActivityIndicator size="small" color="#334155" />
              <Text className="ml-2 text-sm text-slate-600">Chargement...</Text>
            </View>
          ) : conversations.length === 0 ? (
            <Text className="mt-3 text-sm text-slate-500">Aucune conversation pour le moment.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
              <View className="flex-row gap-2">
                {conversations.map((conversation) => {
                  const active = selectedConversationId === conversation.id;
                  const participants = participantsByConversation[conversation.id] ?? [];
                  const peer = participants.find((item) => item.user_id !== userId);
                  return (
                    <TouchableOpacity
                      key={conversation.id}
                      className={`rounded-2xl px-4 py-3 ${active ? "bg-[#111827]" : "bg-slate-100"}`}
                      onPress={async () => {
                        setSelectedConversationId(conversation.id);
                        await loadMessages(conversation.id);
                      }}
                    >
                      <Text className={`text-sm font-semibold ${active ? "text-white" : "text-slate-800"}`}>
                        {peer ? `Chat ${peer.user_id.slice(0, 8)}` : `Conv ${conversation.id.slice(0, 6)}`}
                      </Text>
                      <Text className={`text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>
                        {formatTime(conversation.last_message_at ?? conversation.updated_at)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-4 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Fil de discussion</Text>
          <Text className="mt-2 text-sm font-semibold text-slate-800">{selectedConversationLabel}</Text>

          {selectedConversationId ? (
            <View className="mt-3">
              {messages.length === 0 ? (
                <Text className="text-sm text-slate-500">Aucun message dans cette conversation.</Text>
              ) : (
                messages.map((message) => {
                  const mine = message.sender_user_id === userId;
                  const isArrival = message.message_type === "arrival";
                  const isVoice = message.message_type === "voice";
                  return (
                    <View
                      key={message.id}
                      className={`mb-2 rounded-2xl px-4 py-3 ${
                        isArrival
                          ? "bg-emerald-100"
                          : mine
                          ? "bg-[#111827]"
                          : "border border-slate-200 bg-white"
                      }`}
                    >
                      <Text
                        className={`text-xs uppercase tracking-widest ${
                          isArrival ? "text-emerald-700" : mine ? "text-slate-300" : "text-slate-500"
                        }`}
                      >
                        {isArrival
                          ? "Bien rentre"
                          : isVoice
                          ? "Vocal"
                          : message.message_type === "system"
                          ? "Systeme"
                          : mine
                          ? "Moi"
                          : "Proche"}
                      </Text>
                      {isVoice ? (
                        <View className="mt-2 flex-row items-center">
                          <Ionicons
                            name="mic-outline"
                            size={16}
                            color={mine ? "#E2E8F0" : "#334155"}
                          />
                          <Text
                            className={`ml-2 text-sm font-semibold ${
                              mine ? "text-slate-100" : "text-slate-800"
                            }`}
                          >
                            Vocal {Math.max(1, Math.round((message.duration_ms ?? 0) / 1000))} sec
                          </Text>
                        </View>
                      ) : null}
                      {message.body ? (
                        <Text
                          className={`mt-2 text-sm ${
                            isArrival
                              ? "text-emerald-900"
                              : mine
                              ? "text-white"
                              : "text-slate-700"
                          }`}
                        >
                          {message.body}
                        </Text>
                      ) : null}
                      <Text
                        className={`mt-2 text-xs ${
                          isArrival ? "text-emerald-700" : mine ? "text-slate-300" : "text-slate-500"
                        }`}
                      >
                        {formatDate(message.created_at)} {formatTime(message.created_at)}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          ) : (
            <Text className="mt-3 text-sm text-slate-500">
              Ouvre une conversation pour commencer a discuter.
            </Text>
          )}
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-4 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Ecrire un message</Text>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Ton message"
            placeholderTextColor="#94a3b8"
            value={textMessage}
            onChangeText={setTextMessage}
          />
          <TouchableOpacity
            className={`mt-3 rounded-2xl px-4 py-3 ${
              textMessage.trim() && selectedConversationId && !busy ? "bg-[#111827]" : "bg-slate-300"
            }`}
            onPress={sendText}
            disabled={!textMessage.trim() || !selectedConversationId || busy}
          >
            <Text className="text-center text-sm font-semibold text-white">Envoyer le message</Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-4 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">Vocal (beta)</Text>
          <Text className="mt-2 text-sm text-slate-600">
            Enregistrement reel a brancher ensuite. Pour l instant, un vocal beta est journalise.
          </Text>
          <View className="mt-3 flex-row gap-2">
            {[10, 15, 30, 45].map((seconds) => {
              const active = voiceSeconds === seconds;
              return (
                <TouchableOpacity
                  key={`voice-${seconds}`}
                  className={`rounded-full px-3 py-2 ${
                    active ? "bg-[#0EA5E9]" : "border border-slate-200 bg-white"
                  }`}
                  onPress={() => setVoiceSeconds(seconds)}
                >
                  <Text className={`text-sm font-semibold ${active ? "text-white" : "text-slate-700"}`}>
                    {seconds}s
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-base text-slate-900"
            placeholder="Note optionnelle du vocal"
            placeholderTextColor="#94a3b8"
            value={voiceNote}
            onChangeText={setVoiceNote}
          />
          <TouchableOpacity
            className={`mt-3 rounded-2xl px-4 py-3 ${
              selectedConversationId && !busy ? "bg-[#0F766E]" : "bg-slate-300"
            }`}
            onPress={sendVoice}
            disabled={!selectedConversationId || busy}
          >
            <Text className="text-center text-sm font-semibold text-white">Envoyer le vocal</Text>
          </TouchableOpacity>
        </View>

        <View className="mt-4 rounded-3xl border border-[#E7E0D7] bg-white/90 p-4 shadow-sm">
          <Text className="text-xs uppercase tracking-widest text-slate-500">
            Historique "bien rentre"
          </Text>
          {arrivalHistory.length === 0 ? (
            <Text className="mt-3 text-sm text-slate-500">Aucune confirmation d arrivee.</Text>
          ) : (
            arrivalHistory.slice(0, 8).map((item) => (
              <View key={`arrival-${item.id}`} className="mt-2 rounded-xl bg-emerald-50 px-3 py-3">
                <Text className="text-xs uppercase tracking-widest text-emerald-700">
                  {formatDate(item.created_at)} {formatTime(item.created_at)}
                </Text>
                <Text className="mt-1 text-sm font-semibold text-emerald-900">
                  {item.body || "Je suis bien rentre."}
                </Text>
              </View>
            ))
          )}
        </View>

        {errorMessage ? <Text className="mt-4 text-sm text-red-600">{errorMessage}</Text> : null}
        {successMessage ? <Text className="mt-4 text-sm text-emerald-600">{successMessage}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
