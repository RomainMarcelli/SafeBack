// Tests unitaires pour valider le comportement de `messagingDb` et prévenir les régressions.
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data?: any; error?: any; count?: number | null };
type TableResultMap = Record<string, QueryResult>;

const state = vi.hoisted(() => ({
  sessionUserId: "user-1" as string | null,
  tableResults: {} as Record<string, TableResultMap>,
  calls: [] as Array<{ table: string; action: string; args?: any[]; payload?: any }>,
  rpcHandler: null as null | ((fn: string, params: Record<string, any>) => QueryResult | Promise<QueryResult>)
}));

function getResult(table: string, action: string): QueryResult {
  return state.tableResults[table]?.[action] ?? { data: null, error: null, count: null };
}

function setResult(table: string, action: string, result: QueryResult) {
  if (!state.tableResults[table]) state.tableResults[table] = {};
  state.tableResults[table][action] = result;
}

function createChain(table: string) {
  let lastAction = "select";
  const chain: any = {};

  chain.select = vi.fn((...args: any[]) => {
    state.calls.push({ table, action: "select", args });
    lastAction = "select";
    return chain;
  });
  chain.order = vi.fn((...args: any[]) => {
    state.calls.push({ table, action: "order", args });
    lastAction = "order";
    return chain;
  });
  chain.limit = vi.fn((...args: any[]) => {
    state.calls.push({ table, action: "limit", args });
    lastAction = "limit";
    return chain;
  });
  chain.insert = vi.fn((payload: any) => {
    state.calls.push({ table, action: "insert", payload });
    lastAction = "insert";
    return chain;
  });
  chain.upsert = vi.fn((payload: any, ...args: any[]) => {
    state.calls.push({ table, action: "upsert", payload, args });
    lastAction = "upsert";
    return chain;
  });
  chain.update = vi.fn((payload: any) => {
    state.calls.push({ table, action: "update", payload });
    lastAction = "update";
    return chain;
  });
  chain.eq = vi.fn((...args: any[]) => {
    state.calls.push({ table, action: "eq", args });
    lastAction = "eq";
    return chain;
  });
  chain.or = vi.fn((...args: any[]) => {
    state.calls.push({ table, action: "or", args });
    lastAction = "or";
    return chain;
  });
  chain.in = vi.fn((...args: any[]) => {
    state.calls.push({ table, action: "in", args });
    lastAction = "in";
    return chain;
  });
  chain.is = vi.fn((...args: any[]) => {
    state.calls.push({ table, action: "is", args });
    lastAction = "is";
    return chain;
  });
  chain.single = vi.fn(async () => {
    state.calls.push({ table, action: "single" });
    return getResult(table, "single");
  });
  chain.then = (resolve: (value: QueryResult) => any, reject?: (reason: unknown) => any) =>
    Promise.resolve(getResult(table, lastAction)).then(resolve, reject);

  return chain;
}

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn((table: string) => createChain(table)),
  rpc: vi.fn(async (fn: string, params: Record<string, any>) => {
    state.calls.push({ table: "rpc", action: fn, args: [params] });
    if (state.rpcHandler) {
      return state.rpcHandler(fn, params);
    }
    return { data: null, error: null };
  }),
  auth: {
    getSession: vi.fn(async () => ({
      data: {
        session: state.sessionUserId ? { user: { id: state.sessionUserId } } : null
      }
    }))
  }
}));

vi.mock("../core/supabase", () => ({
  supabase: supabaseMock
}));

import {
  createGuardianAssignment,
  ensureDirectConversation,
  getUnreadNotificationsCount,
  listArrivalMessages,
  listConversations,
  listConversationMessages,
  listConversationParticipants,
  listAppNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  listSecurityTimelineEvents,
  requestGuardianWellbeingCheck,
  revokeGuardianAssignment,
  sendArrivalSignalToGuardians,
  sendLowBatterySignalToGuardians,
  sendAutoCheckinSignalToRecipients,
  sendSosSignalToGuardians,
  sendTripStartedSignalToGuardians,
  sendConversationMessage
} from "./messagingDb";

describe("messagingDb", () => {
  beforeEach(() => {
    state.sessionUserId = "user-1";
    state.tableResults = {};
    state.calls = [];
    state.rpcHandler = null;
    vi.clearAllMocks();
  });

  it("createGuardianAssignment blocks self assignment", async () => {
    await expect(createGuardianAssignment("user-1")).rejects.toThrow(
      "Impossible de s assigner soi-meme comme garant."
    );
  });

  it("createGuardianAssignment upserts row for another user", async () => {
    setResult("guardianships", "single", {
      data: { id: "g-1", owner_user_id: "user-1", guardian_user_id: "user-2", status: "active" },
      error: null
    });

    const row = await createGuardianAssignment("user-2");
    expect(row.id).toBe("g-1");

    const upsertCall = state.calls.find((call) => call.table === "guardianships" && call.action === "upsert");
    expect(upsertCall?.payload).toMatchObject({
      owner_user_id: "user-1",
      guardian_user_id: "user-2",
      status: "active"
    });
    expect(upsertCall?.args?.[0]).toEqual({
      onConflict: "owner_user_id,guardian_user_id"
    });
  });

  it("revokeGuardianAssignment updates active guardian row", async () => {
    setResult("guardianships", "eq", { data: null, error: null });

    await expect(revokeGuardianAssignment("user-2")).resolves.toBeUndefined();

    const updateCall = state.calls.find((call) => call.table === "guardianships" && call.action === "update");
    expect(updateCall?.payload).toEqual({ status: "revoked" });
    expect(
      state.calls.some(
        (call) =>
          call.table === "guardianships" &&
          call.action === "eq" &&
          call.args?.[0] === "guardian_user_id" &&
          call.args?.[1] === "user-2"
      )
    ).toBe(true);
  });

  it("ensureDirectConversation calls rpc and returns id", async () => {
    state.rpcHandler = async (fn, params) => {
      if (fn === "ensure_direct_conversation") {
        return { data: `conv-${params.p_other_user_id}`, error: null };
      }
      return { data: null, error: null };
    };

    await expect(ensureDirectConversation("user-7")).resolves.toBe("conv-user-7");
  });

  it("listConversations returns empty when user has no participant rows", async () => {
    setResult("conversation_participants", "eq", { data: [], error: null });

    await expect(listConversations()).resolves.toEqual([]);
  });

  it("listConversations loads conversations ordered by last message", async () => {
    setResult("conversation_participants", "eq", {
      data: [{ conversation_id: "c1" }, { conversation_id: "c2" }],
      error: null
    });
    setResult("conversations", "order", {
      data: [{ id: "c2" }, { id: "c1" }],
      error: null
    });

    await expect(listConversations()).resolves.toEqual([{ id: "c2" }, { id: "c1" }]);
  });

  it("sendConversationMessage writes text payload from authenticated user", async () => {
    setResult("messages", "single", {
      data: { id: "m-1", conversation_id: "c-1", body: "Salut" },
      error: null
    });

    const message = await sendConversationMessage({
      conversationId: "c-1",
      messageType: "text",
      body: "Salut"
    });

    expect(message.id).toBe("m-1");
    const insertCall = state.calls.find((call) => call.table === "messages" && call.action === "insert");
    expect(insertCall?.payload).toMatchObject({
      conversation_id: "c-1",
      sender_user_id: "user-1",
      message_type: "text",
      body: "Salut"
    });
  });

  it("list helpers return participants, messages and arrival history", async () => {
    setResult("conversation_participants", "order", {
      data: [{ user_id: "user-1" }, { user_id: "user-2" }],
      error: null
    });
    setResult("messages", "order", {
      data: [{ id: "m-1" }, { id: "m-2" }],
      error: null
    });
    setResult("messages", "limit", {
      data: [{ id: "arrival-1", message_type: "arrival" }],
      error: null
    });

    await expect(listConversationParticipants("c-1")).resolves.toHaveLength(2);
    await expect(listConversationMessages("c-1")).resolves.toHaveLength(2);
    await expect(listArrivalMessages(10)).resolves.toEqual([{ id: "arrival-1", message_type: "arrival" }]);
  });

  it("notification helpers load and mark read", async () => {
    setResult("app_notifications", "limit", {
      data: [{ id: "n-1", title: "T", body: "B" }],
      error: null
    });
    setResult("app_notifications", "is", { data: null, error: null, count: 3 });

    await expect(listAppNotifications(20)).resolves.toEqual([{ id: "n-1", title: "T", body: "B" }]);
    await expect(getUnreadNotificationsCount()).resolves.toBe(3);

    await markNotificationRead("n-1");
    await markAllNotificationsRead();

    expect(
      state.calls.some((call) => call.table === "app_notifications" && call.action === "update")
    ).toBe(true);
    expect(
      state.calls.some(
        (call) =>
          call.table === "app_notifications" &&
          call.action === "eq" &&
          call.args?.[0] === "user_id" &&
          call.args?.[1] === "user-1"
      )
    ).toBe(true);
  });

  it("sendArrivalSignalToGuardians deduplicates guardians and sends one message each", async () => {
    setResult("guardianships", "eq", {
      data: [
        { guardian_user_id: "guardian-1" },
        { guardian_user_id: "guardian-1" },
        { guardian_user_id: "guardian-2" }
      ],
      error: null
    });
    setResult("messages", "single", {
      data: { id: "msg-arrival" },
      error: null
    });

    state.rpcHandler = async (fn, params) => {
      if (fn === "ensure_direct_conversation") {
        return { data: `conv-${params.p_other_user_id}`, error: null };
      }
      return { data: null, error: null };
    };

    const result = await sendArrivalSignalToGuardians({ note: "Je suis bien rentré." });

    expect(result).toEqual({ conversations: 2 });
    const rpcCalls = state.calls.filter(
      (call) => call.table === "rpc" && call.action === "ensure_direct_conversation"
    );
    expect(rpcCalls).toHaveLength(2);

    const insertCalls = state.calls.filter((call) => call.table === "messages" && call.action === "insert");
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0]?.payload.message_type).toBe("arrival");
    expect(insertCalls[1]?.payload.message_type).toBe("arrival");
    expect(insertCalls[0]?.payload.metadata).toMatchObject({
      event_type: "arrival_confirmation"
    });
  });

  it("sendTripStartedSignalToGuardians sends one system event per unique guardian", async () => {
    setResult("guardianships", "eq", {
      data: [{ guardian_user_id: "guardian-1" }, { guardian_user_id: "guardian-2" }],
      error: null
    });
    setResult("messages", "single", {
      data: { id: "msg-start" },
      error: null
    });

    state.rpcHandler = async (fn, params) => {
      if (fn === "ensure_direct_conversation") {
        return { data: `conv-${params.p_other_user_id}`, error: null };
      }
      return { data: null, error: null };
    };

    const result = await sendTripStartedSignalToGuardians({
      sessionId: "session-1",
      fromAddress: "A",
      toAddress: "B",
      expectedArrivalIso: "2026-02-14T20:15:00.000Z"
    });

    expect(result).toEqual({ conversations: 2 });
    const insertCalls = state.calls.filter((call) => call.table === "messages" && call.action === "insert");
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0]?.payload.message_type).toBe("system");
    expect(insertCalls[0]?.payload.metadata).toMatchObject({
      event_type: "guardian_trip_started",
      session_id: "session-1"
    });
  });

  it("sendSosSignalToGuardians sends SOS system events", async () => {
    setResult("guardianships", "eq", {
      data: [{ guardian_user_id: "guardian-1" }],
      error: null
    });
    setResult("messages", "single", {
      data: { id: "msg-sos" },
      error: null
    });

    state.rpcHandler = async (fn, params) => {
      if (fn === "ensure_direct_conversation") {
        return { data: `conv-${params.p_other_user_id}`, error: null };
      }
      return { data: null, error: null };
    };

    const result = await sendSosSignalToGuardians({
      sessionId: "session-1",
      body: "ALERTE SOS"
    });

    expect(result).toEqual({ conversations: 1 });
    const insertCall = state.calls.find((call) => call.table === "messages" && call.action === "insert");
    expect(insertCall?.payload.message_type).toBe("system");
    expect(insertCall?.payload.metadata).toMatchObject({
      event_type: "sos_alert",
      session_id: "session-1"
    });
  });

  it("sendLowBatterySignalToGuardians sends low battery system events", async () => {
    setResult("guardianships", "eq", {
      data: [{ guardian_user_id: "guardian-1" }],
      error: null
    });
    setResult("messages", "single", {
      data: { id: "msg-battery" },
      error: null
    });

    state.rpcHandler = async (fn, params) => {
      if (fn === "ensure_direct_conversation") {
        return { data: `conv-${params.p_other_user_id}`, error: null };
      }
      return { data: null, error: null };
    };

    const result = await sendLowBatterySignalToGuardians({
      sessionId: "session-9",
      batteryLevelPercent: 18
    });

    expect(result).toEqual({ conversations: 1 });
    const insertCall = state.calls.find((call) => call.table === "messages" && call.action === "insert");
    expect(insertCall?.payload.message_type).toBe("system");
    expect(insertCall?.payload.metadata).toMatchObject({
      event_type: "low_battery",
      session_id: "session-9",
      battery_level_percent: 18
    });
  });

  it("sendAutoCheckinSignalToRecipients sends one message per unique recipient", async () => {
    setResult("messages", "single", {
      data: { id: "msg-auto-checkin" },
      error: null
    });

    state.rpcHandler = async (fn, params) => {
      if (fn === "ensure_direct_conversation") {
        return { data: `conv-${params.p_other_user_id}`, error: null };
      }
      return { data: null, error: null };
    };

    const result = await sendAutoCheckinSignalToRecipients({
      recipientUserIds: ["friend-1", "friend-1", "friend-2", "user-1"],
      placeLabel: "Maison",
      placeAddress: "10 rue de test",
      latitude: 49.4,
      longitude: 2.8
    });

    expect(result).toEqual({ conversations: 2 });
    const insertCalls = state.calls.filter((call) => call.table === "messages" && call.action === "insert");
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0]?.payload.metadata).toMatchObject({
      event_type: "auto_checkin_arrival",
      place_label: "Maison"
    });
  });

  it("listSecurityTimelineEvents merges trips, arrivals, sos and delay checks", async () => {
    setResult("sessions", "limit", {
      data: [
        {
          id: "s-1",
          from_address: "Maison",
          to_address: "Travail",
          created_at: "2026-02-14T18:00:00.000Z"
        }
      ],
      error: null
    });
    setResult("messages", "limit", {
      data: [
        {
          id: "m-arrival",
          message_type: "arrival",
          body: "Je suis bien rentré.",
          metadata: { event_type: "arrival_confirmation" },
          created_at: "2026-02-14T19:00:00.000Z"
        },
        {
          id: "m-sos",
          message_type: "system",
          body: "ALERTE SOS",
          metadata: { event_type: "sos_alert" },
          created_at: "2026-02-14T20:00:00.000Z"
        },
        {
          id: "m-battery",
          message_type: "system",
          body: "Batterie faible",
          metadata: { event_type: "low_battery" },
          created_at: "2026-02-14T20:30:00.000Z"
        },
        {
          id: "m-auto",
          message_type: "system",
          body: "Arrivée automatique",
          metadata: { event_type: "auto_checkin_arrival" },
          created_at: "2026-02-14T20:40:00.000Z"
        }
      ],
      error: null
    });
    setResult("app_notifications", "limit", {
      data: [
        {
          id: "n-delay",
          notification_type: "guardian_check_request",
          title: "Demande de nouvelles",
          body: "Un proche demande de tes nouvelles",
          data: {},
          created_at: "2026-02-14T21:00:00.000Z"
        }
      ],
      error: null
    });

    const result = await listSecurityTimelineEvents(20);

    expect(result.map((item) => item.type)).toEqual([
      "delay_check",
      "auto_checkin",
      "low_battery",
      "sos",
      "arrival_confirmation",
      "trip_started"
    ]);
    expect(result[0]?.title).toBe("Demande de nouvelles");
  });

  it("requestGuardianWellbeingCheck calls rpc and normalizes payload", async () => {
    state.rpcHandler = async (fn, params) => {
      if (fn === "request_guardian_wellbeing_check") {
        return {
          data: {
            sent: true,
            status: "sent",
            has_recent_trip_24h: false
          },
          error: null
        };
      }
      return { data: null, error: null };
    };

    const result = await requestGuardianWellbeingCheck("owner-7");
    expect(result).toEqual({
      sent: true,
      status: "sent",
      has_recent_trip_24h: false
    });
    expect(
      state.calls.some(
        (call) =>
          call.table === "rpc" &&
          call.action === "request_guardian_wellbeing_check" &&
          call.args?.[0]?.p_owner_user_id === "owner-7"
      )
    ).toBe(true);
  });
});
