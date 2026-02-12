import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: any; error: any };
type TableResultMap = Record<string, QueryResult>;

const state = vi.hoisted(() => ({
  sessionUserId: "user-1" as string | null,
  tableResults: {} as Record<string, TableResultMap>,
  calls: [] as Array<{ table: string; action: string; args?: any[]; payload?: any }>,
  rpcResult: { data: null, error: null } as QueryResult
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
  chain.order = vi.fn((...args: any[]) => {
    state.calls.push({ table, action: "order", args });
    lastAction = "order";
    return chain;
  });
  chain.upsert = vi.fn((payload: any) => {
    state.calls.push({ table, action: "upsert", payload });
    lastAction = "upsert";
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
  chain.delete = vi.fn(() => {
    state.calls.push({ table, action: "delete" });
    lastAction = "delete";
    return chain;
  });
  chain.eq = vi.fn((...args: any[]) => {
    state.calls.push({ table, action: "eq", args });
    lastAction = "eq";
    return chain;
  });
  chain.in = vi.fn((...args: any[]) => {
    state.calls.push({ table, action: "in", args });
    lastAction = "in";
    return chain;
  });
  chain.neq = vi.fn((...args: any[]) => {
    state.calls.push({ table, action: "neq", args });
    lastAction = "neq";
    return chain;
  });
  chain.single = vi.fn(async () => {
    state.calls.push({ table, action: "single" });
    return getResult(table, "single");
  });
  chain.maybeSingle = vi.fn(async () => {
    state.calls.push({ table, action: "maybeSingle" });
    return getResult(table, "maybeSingle");
  });
  chain.then = (resolve: (value: QueryResult) => any, reject?: (reason: unknown) => any) =>
    Promise.resolve(getResult(table, lastAction)).then(resolve, reject);

  return chain;
}

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn((table: string) => createChain(table)),
  rpc: vi.fn(async (...args: any[]) => {
    state.calls.push({ table: "rpc", action: "rpc", args });
    return state.rpcResult;
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
  createSessionWithContacts,
  createContact,
  createFavoriteAddress,
  deleteContact,
  deleteFavoriteAddress,
  deleteAllSessions,
  deleteSession,
  getProfile,
  getSessionById,
  insertLocationPoint,
  listContacts,
  listFavoriteAddresses,
  listSessionContacts,
  listSessions,
  getSharedSessionSnapshot,
  setSessionLiveShare,
  upsertProfile
} from "./db";

describe("db helpers", () => {
  beforeEach(() => {
    state.sessionUserId = "user-1";
    state.tableResults = {};
    state.calls = [];
    state.rpcResult = { data: null, error: null };
    vi.clearAllMocks();
  });

  it("upsertProfile throws when user is not authenticated", async () => {
    state.sessionUserId = null;
    await expect(upsertProfile({ username: "rome" })).rejects.toThrow("Utilisateur non authentifie.");
  });

  it("upsertProfile uses provided user_id", async () => {
    state.sessionUserId = null;
    setResult("profiles", "single", {
      data: { user_id: "provided-id", username: "rome" },
      error: null
    });

    await upsertProfile({ user_id: "provided-id", username: "rome" });

    const upsertCall = state.calls.find((call) => call.table === "profiles" && call.action === "upsert");
    expect(upsertCall?.payload.user_id).toBe("provided-id");
  });

  it("getProfile returns nullable profile", async () => {
    setResult("profiles", "maybeSingle", { data: null, error: null });
    await expect(getProfile()).resolves.toBeNull();
  });

  it("getProfile throws when query fails", async () => {
    setResult("profiles", "maybeSingle", { data: null, error: new Error("profile failed") });
    await expect(getProfile()).rejects.toThrow("profile failed");
  });

  it("createSessionWithContacts inserts relation rows for selected contacts", async () => {
    setResult("sessions", "single", {
      data: { id: "session-1", from_address: "A", to_address: "B" },
      error: null
    });
    setResult("session_contacts", "insert", { data: null, error: null });

    await createSessionWithContacts({
      from_address: "A",
      to_address: "B",
      contactIds: ["c1", "c2"]
    });

    const linksInsert = state.calls.find(
      (call) => call.table === "session_contacts" && call.action === "insert"
    );
    expect(linksInsert?.payload).toEqual([
      { session_id: "session-1", contact_id: "c1" },
      { session_id: "session-1", contact_id: "c2" }
    ]);
  });

  it("createSessionWithContacts throws when base session insert fails", async () => {
    setResult("sessions", "single", {
      data: null,
      error: new Error("session insert failed")
    });

    await expect(
      createSessionWithContacts({
        from_address: "A",
        to_address: "B",
        contactIds: ["c1"]
      })
    ).rejects.toThrow("session insert failed");
  });

  it("createSessionWithContacts throws when contacts link insert fails", async () => {
    setResult("sessions", "single", {
      data: { id: "session-1", from_address: "A", to_address: "B" },
      error: null
    });
    setResult("session_contacts", "insert", {
      data: null,
      error: new Error("link insert failed")
    });

    await expect(
      createSessionWithContacts({
        from_address: "A",
        to_address: "B",
        contactIds: ["c1"]
      })
    ).rejects.toThrow("link insert failed");
  });

  it("setSessionLiveShare disables token when sharing is off", async () => {
    setResult("sessions", "single", {
      data: { share_live: false, share_token: null },
      error: null
    });

    const result = await setSessionLiveShare({
      sessionId: "session-1",
      enabled: false,
      shareToken: "should-be-ignored"
    });

    const updateCall = state.calls.find((call) => call.table === "sessions" && call.action === "update");
    expect(updateCall?.payload).toEqual({
      share_live: false,
      share_token: null
    });
    expect(result).toEqual({
      share_live: false,
      share_token: null
    });
  });

  it("setSessionLiveShare enables token when sharing is on", async () => {
    setResult("sessions", "single", {
      data: { share_live: true, share_token: "token-abc" },
      error: null
    });

    const result = await setSessionLiveShare({
      sessionId: "session-1",
      enabled: true,
      shareToken: "token-abc"
    });

    const updateCall = state.calls.find((call) => call.table === "sessions" && call.action === "update");
    expect(updateCall?.payload).toEqual({
      share_live: true,
      share_token: "token-abc"
    });
    expect(result).toEqual({
      share_live: true,
      share_token: "token-abc"
    });
  });

  it("getSharedSessionSnapshot uses rpc and returns null when no snapshot exists", async () => {
    state.rpcResult = { data: null, error: null };

    const result = await getSharedSessionSnapshot({
      sessionId: "session-1",
      shareToken: "token-1"
    });

    expect(result).toBeNull();
    expect(supabaseMock.rpc).toHaveBeenCalledWith("get_shared_session_snapshot", {
      p_session_id: "session-1",
      p_share_token: "token-1"
    });
  });

  it("deleteAllSessions runs a broad delete filter", async () => {
    setResult("sessions", "neq", { data: null, error: null });

    await deleteAllSessions();

    expect(state.calls.some((call) => call.table === "sessions" && call.action === "neq")).toBe(true);
    expect(state.calls.find((call) => call.table === "sessions" && call.action === "neq")?.args).toEqual([
      "id",
      ""
    ]);
  });

  it("listFavoriteAddresses returns ordered data", async () => {
    setResult("favorite_addresses", "order", {
      data: [{ id: "a1" }, { id: "a2" }],
      error: null
    });

    await expect(listFavoriteAddresses()).resolves.toEqual([{ id: "a1" }, { id: "a2" }]);
  });

  it("listFavoriteAddresses throws when select fails", async () => {
    setResult("favorite_addresses", "order", {
      data: null,
      error: new Error("favorite failed")
    });

    await expect(listFavoriteAddresses()).rejects.toThrow("favorite failed");
  });

  it("listContacts throws when select fails", async () => {
    setResult("contacts", "order", {
      data: null,
      error: new Error("boom")
    });

    await expect(listContacts()).rejects.toThrow("boom");
  });

  it("createFavoriteAddress inserts and returns row", async () => {
    setResult("favorite_addresses", "single", {
      data: { id: "fav-1", label: "Maison", address: "Paris" },
      error: null
    });

    await expect(
      createFavoriteAddress({ label: "Maison", address: "Paris" })
    ).resolves.toMatchObject({ id: "fav-1" });
  });

  it("createContact throws when insert fails", async () => {
    setResult("contacts", "single", {
      data: null,
      error: new Error("insert contact failed")
    });

    await expect(
      createContact({ name: "Romain", channel: "sms", phone: "0700" })
    ).rejects.toThrow("insert contact failed");
  });

  it("createContact forwards contact_group when provided", async () => {
    setResult("contacts", "single", {
      data: { id: "c-group", name: "Nina", channel: "sms", contact_group: "family" },
      error: null
    });

    await createContact({
      name: "Nina",
      channel: "sms",
      phone: "0600000000",
      contact_group: "family"
    });

    const insertCall = state.calls.find((call) => call.table === "contacts" && call.action === "insert");
    expect(insertCall?.payload.contact_group).toBe("family");
  });

  it("deleteContact and deleteFavoriteAddress apply eq filter", async () => {
    setResult("contacts", "eq", { data: null, error: null });
    setResult("favorite_addresses", "eq", { data: null, error: null });

    await deleteContact("contact-1");
    await deleteFavoriteAddress("fav-1");

    expect(
      state.calls.some(
        (call) => call.table === "contacts" && call.action === "eq" && call.args?.[0] === "id"
      )
    ).toBe(true);
    expect(
      state.calls.some(
        (call) =>
          call.table === "favorite_addresses" && call.action === "eq" && call.args?.[0] === "id"
      )
    ).toBe(true);
  });

  it("getSessionById and deleteSession apply id filter", async () => {
    setResult("sessions", "maybeSingle", {
      data: { id: "session-9", from_address: "A", to_address: "B" },
      error: null
    });
    setResult("sessions", "eq", { data: null, error: null });

    await expect(getSessionById("session-9")).resolves.toMatchObject({ id: "session-9" });
    await deleteSession("session-9");

    expect(
      state.calls.some(
        (call) => call.table === "sessions" && call.action === "eq" && call.args?.[0] === "id"
      )
    ).toBe(true);
  });

  it("createSessionWithContacts does not insert links when no contacts", async () => {
    setResult("sessions", "single", {
      data: { id: "session-2", from_address: "A", to_address: "B" },
      error: null
    });

    await createSessionWithContacts({
      from_address: "A",
      to_address: "B",
      contactIds: []
    });

    expect(
      state.calls.some((call) => call.table === "session_contacts" && call.action === "insert")
    ).toBe(false);
  });

  it("setSessionLiveShare throws when update fails", async () => {
    setResult("sessions", "single", {
      data: null,
      error: new Error("update failed")
    });

    await expect(
      setSessionLiveShare({ sessionId: "s1", enabled: true, shareToken: "t1" })
    ).rejects.toThrow("update failed");
  });

  it("getSharedSessionSnapshot throws rpc errors", async () => {
    state.rpcResult = { data: null, error: new Error("rpc failed") };

    await expect(
      getSharedSessionSnapshot({ sessionId: "session-1", shareToken: "token-1" })
    ).rejects.toThrow("rpc failed");
  });

  it("listSessions and insertLocationPoint return rows", async () => {
    setResult("sessions", "order", {
      data: [{ id: "s1" }, { id: "s2" }],
      error: null
    });
    setResult("locations", "single", {
      data: { id: "l1", session_id: "s1", latitude: 1, longitude: 2 },
      error: null
    });

    await expect(listSessions()).resolves.toHaveLength(2);
    await expect(
      insertLocationPoint({ session_id: "s1", latitude: 1, longitude: 2, accuracy: null })
    ).resolves.toMatchObject({ id: "l1" });
  });

  it("listSessionContacts resolves contacts linked to a session", async () => {
    setResult("session_contacts", "eq", {
      data: [{ contact_id: "c1" }, { contact_id: "c2" }],
      error: null
    });
    setResult("contacts", "in", {
      data: [{ id: "c1", name: "A" }, { id: "c2", name: "B" }],
      error: null
    });

    await expect(listSessionContacts("s1")).resolves.toEqual([
      { id: "c1", name: "A" },
      { id: "c2", name: "B" }
    ]);
  });

  it("listSessions throws when query fails", async () => {
    setResult("sessions", "order", {
      data: null,
      error: new Error("sessions failed")
    });

    await expect(listSessions()).rejects.toThrow("sessions failed");
  });
});
