// Tests unitaires pour valider le comportement de `friendsDb` et prévenir les régressions.
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data?: any; error?: any };
type TableResultMap = Record<string, QueryResult>;

const state = vi.hoisted(() => ({
  sessionUserId: "user-1" as string | null,
  tableResults: {} as Record<string, TableResultMap>,
  calls: [] as Array<{ table: string; action: string; args?: any[]; payload?: any }>,
  rpcHandler: null as null | ((fn: string, params: Record<string, any>) => QueryResult | Promise<QueryResult>)
}));

function getResult(table: string, action: string): QueryResult {
  return state.tableResults[table]?.[action] ?? { data: null, error: null };
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
  chain.order = vi.fn((...args: any[]) => {
    state.calls.push({ table, action: "order", args });
    lastAction = "order";
    return chain;
  });
  chain.then = (resolve: (value: QueryResult) => any, reject?: (reason: unknown) => any) =>
    Promise.resolve(getResult(table, lastAction)).then(resolve, reject);

  return chain;
}

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn((table: string) => createChain(table)),
  rpc: vi.fn(async (fn: string, params: Record<string, any>) => {
    state.calls.push({ table: "rpc", action: fn, args: [params] });
    if (state.rpcHandler) return state.rpcHandler(fn, params);
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

const ensureDirectConversationMock = vi.hoisted(() => vi.fn(async () => "conv-1"));

vi.mock("./messagingDb", () => ({
  ensureDirectConversation: ensureDirectConversationMock
}));

import {
  ensureMyPublicProfile,
  listFriendRequests,
  listFriends,
  respondToFriendRequest,
  searchPublicProfiles,
  sendFriendRequest
} from "./friendsDb";

describe("friendsDb", () => {
  beforeEach(() => {
    state.sessionUserId = "user-1";
    state.tableResults = {};
    state.calls = [];
    state.rpcHandler = null;
    ensureDirectConversationMock.mockClear();
    vi.clearAllMocks();
  });

  it("ensureMyPublicProfile returns rpc profile payload", async () => {
    state.rpcHandler = async (fn) => {
      if (fn === "ensure_profile_public_id") {
        return {
          data: { user_id: "user-1", public_id: "SB1234", username: "rome" },
          error: null
        };
      }
      return { data: null, error: null };
    };

    const profile = await ensureMyPublicProfile();
    expect(profile.public_id).toBe("SB1234");
  });

  it("searchPublicProfiles calls rpc with bounded limit", async () => {
    state.rpcHandler = async (fn, params) => {
      if (fn === "search_public_profiles") {
        expect(params.p_limit).toBe(50);
        return {
          data: [{ user_id: "user-2", public_id: "SB2", username: "lea" }],
          error: null
        };
      }
      return { data: null, error: null };
    };

    const rows = await searchPublicProfiles("lea", 500);
    expect(rows).toHaveLength(1);
  });

  it("sendFriendRequest forwards payload to rpc", async () => {
    state.rpcHandler = async (fn, params) => {
      if (fn === "send_friend_request") {
        return {
          data: {
            id: "fr-1",
            requester_user_id: "user-1",
            target_user_id: params.p_target_user_id,
            status: "pending"
          },
          error: null
        };
      }
      return { data: null, error: null };
    };

    const request = await sendFriendRequest("user-2", "Salut");
    expect(request.id).toBe("fr-1");
  });

  it("respondToFriendRequest can auto-open conversation when accepted", async () => {
    state.rpcHandler = async (fn) => {
      if (fn === "respond_friend_request") {
        return {
          data: {
            id: "fr-1",
            requester_user_id: "user-2",
            target_user_id: "user-1",
            status: "accepted"
          },
          error: null
        };
      }
      return { data: null, error: null };
    };

    await respondToFriendRequest({ requestId: "fr-1", accept: true });
    expect(ensureDirectConversationMock).toHaveBeenCalledWith("user-2");
  });

  it("listFriendRequests hydrates requester and target profiles", async () => {
    setResult("friend_requests", "order", {
      data: [
        {
          id: "fr-1",
          requester_user_id: "user-2",
          target_user_id: "user-1",
          status: "pending"
        }
      ],
      error: null
    });

    state.rpcHandler = async (fn) => {
      if (fn === "get_public_profiles") {
        return {
          data: [
            { user_id: "user-1", public_id: "SB1", username: "me" },
            { user_id: "user-2", public_id: "SB2", username: "lea" }
          ],
          error: null
        };
      }
      return { data: null, error: null };
    };

    const rows = await listFriendRequests();
    expect(rows[0]?.direction).toBe("incoming");
    expect(rows[0]?.requesterProfile?.username).toBe("lea");
  });

  it("listFriends hydrates friend profile", async () => {
    setResult("friendships", "order", {
      data: [{ id: "f1", user_id: "user-1", friend_user_id: "user-9" }],
      error: null
    });
    state.rpcHandler = async (fn) => {
      if (fn === "get_public_profiles") {
        return {
          data: [{ user_id: "user-9", public_id: "SB9", username: "noah" }],
          error: null
        };
      }
      return { data: null, error: null };
    };

    const rows = await listFriends();
    expect(rows[0]?.profile?.public_id).toBe("SB9");
  });
});
