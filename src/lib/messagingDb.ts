import { supabase } from "./supabase";

export type GuardianAssignment = {
  id: string;
  owner_user_id: string;
  guardian_user_id: string;
  status: "active" | "revoked";
  created_at?: string;
};

export type Conversation = {
  id: string;
  kind: "direct" | "group";
  created_by: string;
  created_at?: string;
  updated_at?: string;
  last_message_at?: string;
};

export type ConversationParticipant = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "member" | "admin";
  joined_at?: string;
};

export type ConversationMessage = {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  message_type: "text" | "voice" | "arrival" | "system";
  body?: string | null;
  voice_url?: string | null;
  duration_ms?: number | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
};

export type AppNotification = {
  id: string;
  user_id: string;
  notification_type: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  read_at?: string | null;
  created_at?: string;
};

async function requireUserId(): Promise<string> {
  const session = await supabase.auth.getSession();
  const userId = session.data.session?.user.id;
  if (!userId) throw new Error("Utilisateur non authentifie.");
  return userId;
}

export async function createGuardianAssignment(guardianUserId: string): Promise<GuardianAssignment> {
  const ownerUserId = await requireUserId();
  if (ownerUserId === guardianUserId) {
    throw new Error("Impossible de s assigner soi-meme comme garant.");
  }
  const { data, error } = await supabase
    .from("guardianships")
    .upsert(
      {
        owner_user_id: ownerUserId,
        guardian_user_id: guardianUserId,
        status: "active"
      },
      {
        onConflict: "owner_user_id,guardian_user_id"
      }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as GuardianAssignment;
}

export async function revokeGuardianAssignment(guardianUserId: string): Promise<void> {
  const ownerUserId = await requireUserId();
  const { error } = await supabase
    .from("guardianships")
    .update({ status: "revoked" })
    .eq("owner_user_id", ownerUserId)
    .eq("guardian_user_id", guardianUserId)
    .eq("status", "active");
  if (error) throw error;
}

export async function listGuardianAssignments(): Promise<GuardianAssignment[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("guardianships")
    .select("*")
    .or(`owner_user_id.eq.${userId},guardian_user_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GuardianAssignment[];
}

export async function ensureDirectConversation(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc("ensure_direct_conversation", {
    p_other_user_id: otherUserId
  });
  if (error) throw error;
  if (!data) throw new Error("Conversation introuvable.");
  return String(data);
}

export async function listConversations(): Promise<Conversation[]> {
  const userId = await requireUserId();
  const { data: participants, error: participantsError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", userId);
  if (participantsError) throw participantsError;

  const conversationIds = (participants ?? [])
    .map((row: any) => row.conversation_id as string | null | undefined)
    .filter((value): value is string => Boolean(value));
  if (conversationIds.length === 0) return [];

  const { data: conversations, error: conversationsError } = await supabase
    .from("conversations")
    .select("*")
    .in("id", conversationIds)
    .order("last_message_at", { ascending: false });
  if (conversationsError) throw conversationsError;
  return (conversations ?? []) as Conversation[];
}

export async function listConversationParticipants(
  conversationId: string
): Promise<ConversationParticipant[]> {
  const { data, error } = await supabase
    .from("conversation_participants")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ConversationParticipant[];
}

export async function listConversationMessages(
  conversationId: string
): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ConversationMessage[];
}

export async function listArrivalMessages(limit = 50): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("message_type", "arrival")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ConversationMessage[];
}

export async function sendConversationMessage(params: {
  conversationId: string;
  messageType: "text" | "voice" | "arrival" | "system";
  body?: string | null;
  voiceUrl?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
}): Promise<ConversationMessage> {
  const senderUserId = await requireUserId();
  const payload = {
    conversation_id: params.conversationId,
    sender_user_id: senderUserId,
    message_type: params.messageType,
    body: params.body ?? null,
    voice_url: params.voiceUrl ?? null,
    duration_ms: params.durationMs ?? null,
    metadata: params.metadata ?? {}
  };
  const { data, error } = await supabase
    .from("messages")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as ConversationMessage;
}

export async function listAppNotifications(limit = 50): Promise<AppNotification[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("app_notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function getUnreadNotificationsCount(): Promise<number> {
  const userId = await requireUserId();
  const { count, error } = await supabase
    .from("app_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from("app_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("app_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
}

export async function sendArrivalSignalToGuardians(params?: {
  note?: string | null;
}): Promise<{ conversations: number }> {
  const userId = await requireUserId();
  const { data: guardians, error: guardiansError } = await supabase
    .from("guardianships")
    .select("guardian_user_id")
    .eq("owner_user_id", userId)
    .eq("status", "active");
  if (guardiansError) throw guardiansError;

  const uniqueGuardians = [...new Set((guardians ?? []).map((row: any) => row.guardian_user_id as string))];
  let sent = 0;
  for (const guardianId of uniqueGuardians) {
    const conversationId = await ensureDirectConversation(guardianId);
    await sendConversationMessage({
      conversationId,
      messageType: "arrival",
      body: params?.note?.trim() || "Je suis bien rentre."
    });
    sent += 1;
  }

  return { conversations: sent };
}
