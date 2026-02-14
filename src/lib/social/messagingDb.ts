import { supabase } from "../core/supabase";

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

export type GuardianWellbeingCheckResult = {
  sent: boolean;
  status: "sent" | "disabled" | "not_guardian" | "unknown";
  has_recent_trip_24h?: boolean;
};

export type FriendWellbeingPingResult = {
  sent: boolean;
  status: "sent" | "already_pending" | "unknown";
  ping_id?: string | null;
};

export type FriendWellbeingResponseResult = {
  updated: boolean;
  status: "arrived_yes" | "arrived_no" | "pending" | "unknown";
};

export type SecurityTimelineEvent = {
  id: string;
  type:
    | "trip_started"
    | "arrival_confirmation"
    | "sos"
    | "delay_check"
    | "low_battery"
    | "auto_checkin";
  title: string;
  body: string;
  created_at: string;
  data?: Record<string, unknown> | null;
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
      body: params?.note?.trim() || "Je suis bien rentre.",
      metadata: {
        event_type: "arrival_confirmation"
      }
    });
    sent += 1;
  }

  return { conversations: sent };
}

export async function sendTripStartedSignalToGuardians(params: {
  sessionId: string;
  fromAddress: string;
  toAddress: string;
  expectedArrivalIso?: string | null;
}): Promise<{ conversations: number }> {
  const userId = await requireUserId();
  const { data: guardians, error: guardiansError } = await supabase
    .from("guardianships")
    .select("guardian_user_id")
    .eq("owner_user_id", userId)
    .eq("status", "active");
  if (guardiansError) throw guardiansError;

  const uniqueGuardians = [...new Set((guardians ?? []).map((row: any) => row.guardian_user_id as string))];
  const etaLabel = params.expectedArrivalIso
    ? (() => {
        const date = new Date(params.expectedArrivalIso);
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        return `${hours}:${minutes}`;
      })()
    : null;
  const body = etaLabel
    ? `Je viens de lancer un trajet: ${params.fromAddress} -> ${params.toAddress}. Arrivee prevue vers ${etaLabel}.`
    : `Je viens de lancer un trajet: ${params.fromAddress} -> ${params.toAddress}.`;

  let sent = 0;
  for (const guardianId of uniqueGuardians) {
    const conversationId = await ensureDirectConversation(guardianId);
    await sendConversationMessage({
      conversationId,
      messageType: "system",
      body,
      metadata: {
        event_type: "guardian_trip_started",
        session_id: params.sessionId,
        expected_arrival_time: params.expectedArrivalIso ?? null,
        from_address: params.fromAddress,
        to_address: params.toAddress
      }
    });
    sent += 1;
  }

  return { conversations: sent };
}

export async function sendSosSignalToGuardians(params: {
  sessionId?: string | null;
  body: string;
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
      messageType: "system",
      body: params.body,
      metadata: {
        event_type: "sos_alert",
        session_id: params.sessionId ?? null
      }
    });
    sent += 1;
  }
  return { conversations: sent };
}

export async function sendLowBatterySignalToGuardians(params: {
  sessionId?: string | null;
  batteryLevelPercent: number;
}): Promise<{ conversations: number }> {
  const userId = await requireUserId();
  const { data: guardians, error: guardiansError } = await supabase
    .from("guardianships")
    .select("guardian_user_id")
    .eq("owner_user_id", userId)
    .eq("status", "active");
  if (guardiansError) throw guardiansError;

  const uniqueGuardians = [...new Set((guardians ?? []).map((row: any) => row.guardian_user_id as string))];
  const roundedLevel = Math.max(0, Math.min(100, Math.round(params.batteryLevelPercent)));
  const body = `Alerte SafeBack: batterie faible (${roundedLevel}%). Pense a rester joignable.`;

  let sent = 0;
  for (const guardianId of uniqueGuardians) {
    const conversationId = await ensureDirectConversation(guardianId);
    await sendConversationMessage({
      conversationId,
      messageType: "system",
      body,
      metadata: {
        event_type: "low_battery",
        battery_level_percent: roundedLevel,
        session_id: params.sessionId ?? null
      }
    });
    sent += 1;
  }
  return { conversations: sent };
}

export async function sendAutoCheckinSignalToRecipients(params: {
  recipientUserIds: string[];
  placeLabel: string;
  placeAddress: string;
  latitude: number;
  longitude: number;
}): Promise<{ conversations: number }> {
  const userId = await requireUserId();
  const uniqueRecipients = [
    ...new Set(
      params.recipientUserIds
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && item !== userId)
    )
  ];
  if (uniqueRecipients.length === 0) {
    return { conversations: 0 };
  }

  const mapsUrl = `https://maps.google.com/?q=${params.latitude},${params.longitude}`;
  const body = `Arrivée automatique : je suis arrivé(e) à ${params.placeLabel}. (${params.placeAddress})`;

  let sent = 0;
  for (const recipientUserId of uniqueRecipients) {
    const conversationId = await ensureDirectConversation(recipientUserId);
    await sendConversationMessage({
      conversationId,
      messageType: "system",
      body,
      metadata: {
        event_type: "auto_checkin_arrival",
        place_label: params.placeLabel,
        place_address: params.placeAddress,
        latitude: params.latitude,
        longitude: params.longitude,
        maps_url: mapsUrl
      }
    });
    sent += 1;
  }

  return { conversations: sent };
}

export async function listSecurityTimelineEvents(limit = 100): Promise<SecurityTimelineEvent[]> {
  const userId = await requireUserId();

  const [sessionsResult, sentMessagesResult, notificationsResult] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, from_address, to_address, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("messages")
      .select("id, message_type, body, metadata, created_at")
      .eq("sender_user_id", userId)
      .in("message_type", ["arrival", "system"])
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("app_notifications")
      .select("id, notification_type, title, body, data, created_at")
      .eq("user_id", userId)
      .in("notification_type", ["guardian_check_request", "guardian_check_request_sent"])
      .order("created_at", { ascending: false })
      .limit(limit)
  ]);

  if (sessionsResult.error) throw sessionsResult.error;
  if (sentMessagesResult.error) throw sentMessagesResult.error;
  if (notificationsResult.error) throw notificationsResult.error;

  const sessionEvents: SecurityTimelineEvent[] = (sessionsResult.data ?? []).map((row: any) => ({
    id: `trip-${row.id}`,
    type: "trip_started",
    title: "Trajet lance",
    body: `${row.from_address} -> ${row.to_address}`,
    created_at: String(row.created_at ?? new Date().toISOString()),
    data: {
      session_id: row.id
    }
  }));

  const messageEvents: SecurityTimelineEvent[] = [];
  for (const row of sentMessagesResult.data ?? []) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const eventType = String(metadata.event_type ?? "");
    if (row.message_type === "arrival" || eventType === "arrival_confirmation") {
      messageEvents.push({
        id: `arrival-${row.id}`,
        type: "arrival_confirmation",
        title: "Arrivee confirmee",
        body: String(row.body ?? "Confirmation envoyee a tes garants."),
        created_at: String(row.created_at ?? new Date().toISOString()),
        data: metadata
      });
      continue;
    }
    if (eventType === "sos_alert") {
      messageEvents.push({
        id: `sos-${row.id}`,
        type: "sos",
        title: "SOS declenche",
        body: String(row.body ?? "Alerte SOS envoyee."),
        created_at: String(row.created_at ?? new Date().toISOString()),
        data: metadata
      });
      continue;
    }
    if (eventType === "low_battery") {
      messageEvents.push({
        id: `battery-${row.id}`,
        type: "low_battery",
        title: "Batterie faible partagee",
        body: String(row.body ?? "Alerte batterie faible envoyee aux garants."),
        created_at: String(row.created_at ?? new Date().toISOString()),
        data: metadata
      });
      continue;
    }
    if (eventType === "auto_checkin_arrival") {
      messageEvents.push({
        id: `auto-checkin-${row.id}`,
        type: "auto_checkin",
        title: "Arrivée automatique",
        body: String(row.body ?? "Arrivée automatique envoyée."),
        created_at: String(row.created_at ?? new Date().toISOString()),
        data: metadata
      });
    }
  }

  const notificationEvents: SecurityTimelineEvent[] = (notificationsResult.data ?? []).map((row: any) => ({
    id: `delay-${row.id}`,
    type: "delay_check",
    title: String(row.title ?? "Demande de nouvelles"),
    body: String(row.body ?? "Verification de retard."),
    created_at: String(row.created_at ?? new Date().toISOString()),
    data: (row.data ?? {}) as Record<string, unknown>
  }));

  // Fusionne tous les signaux sécurité dans une seule timeline triée du plus récent au plus ancien.
  return [...sessionEvents, ...messageEvents, ...notificationEvents]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

export async function requestGuardianWellbeingCheck(
  ownerUserId: string
): Promise<GuardianWellbeingCheckResult> {
  const targetOwner = ownerUserId.trim();
  if (!targetOwner) {
    throw new Error("Utilisateur cible manquant.");
  }

  const { data, error } = await supabase.rpc("request_guardian_wellbeing_check", {
    p_owner_user_id: targetOwner
  });
  if (error) throw error;

  const raw = (data ?? {}) as Record<string, unknown>;
  const statusValue = String(raw.status ?? "unknown");
  const normalizedStatus: GuardianWellbeingCheckResult["status"] =
    statusValue === "sent" || statusValue === "disabled" || statusValue === "not_guardian"
      ? statusValue
      : "unknown";

  // Le RPC renvoie un payload JSON pour afficher un résultat précis côté UI.
  return {
    sent: Boolean(raw.sent),
    status: normalizedStatus,
    has_recent_trip_24h:
      typeof raw.has_recent_trip_24h === "boolean" ? raw.has_recent_trip_24h : undefined
  };
}

export async function sendFriendWellbeingPing(
  targetUserId: string
): Promise<FriendWellbeingPingResult> {
  const target = targetUserId.trim();
  if (!target) {
    throw new Error("Utilisateur cible manquant.");
  }

  const { data, error } = await supabase.rpc("send_friend_wellbeing_ping", {
    p_target_user_id: target
  });
  if (error) throw error;

  const raw = (data ?? {}) as Record<string, unknown>;
  const statusValue = String(raw.status ?? "unknown");
  const normalizedStatus: FriendWellbeingPingResult["status"] =
    statusValue === "sent" || statusValue === "already_pending" ? statusValue : "unknown";

  return {
    sent: Boolean(raw.sent),
    status: normalizedStatus,
    ping_id: typeof raw.ping_id === "string" ? raw.ping_id : null
  };
}

export async function respondFriendWellbeingPing(params: {
  pingId: string;
  arrived: boolean;
}): Promise<FriendWellbeingResponseResult> {
  const pingId = params.pingId.trim();
  if (!pingId) {
    throw new Error("Demande introuvable.");
  }

  const { data, error } = await supabase.rpc("respond_friend_wellbeing_ping", {
    p_ping_id: pingId,
    p_arrived: Boolean(params.arrived)
  });
  if (error) throw error;

  const raw = (data ?? {}) as Record<string, unknown>;
  const statusValue = String(raw.status ?? "unknown");
  const normalizedStatus: FriendWellbeingResponseResult["status"] =
    statusValue === "arrived_yes" || statusValue === "arrived_no" || statusValue === "pending"
      ? statusValue
      : "unknown";

  return {
    updated: Boolean(raw.updated),
    status: normalizedStatus
  };
}
