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

vi.mock("./supabase", () => ({
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
  sendArrivalSignalToGuardians,
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

  it("createGuardianAssignment inserts row for another user", async () => {
    setResult("guardianships", "single", {
      data: { id: "g-1", owner_user_id: "user-1", guardian_user_id: "user-2", status: "active" },
      error: null
    });

    const row = await createGuardianAssignment("user-2");
    expect(row.id).toBe("g-1");

    const insertCall = state.calls.find((call) => call.table === "guardianships" && call.action === "insert");
    expect(insertCall?.payload).toMatchObject({
      owner_user_id: "user-1",
      guardian_user_id: "user-2",
      status: "active"
    });
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

    const result = await sendArrivalSignalToGuardians({ note: "Je suis bien rentre." });

    expect(result).toEqual({ conversations: 2 });
    const rpcCalls = state.calls.filter(
      (call) => call.table === "rpc" && call.action === "ensure_direct_conversation"
    );
    expect(rpcCalls).toHaveLength(2);

    const insertCalls = state.calls.filter((call) => call.table === "messages" && call.action === "insert");
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0]?.payload.message_type).toBe("arrival");
    expect(insertCalls[1]?.payload.message_type).toBe("arrival");
  });
});
