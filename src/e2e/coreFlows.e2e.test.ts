// Scénarios E2E (niveau service) : inscription, trajet, SOS, amis, map live, onboarding.
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());
const network = vi.hoisted(() => ({
  isConnected: true,
  isInternetReachable: true
}));
const state = vi.hoisted(() => ({
  sessionUserId: "user-e2e",
  signInCalls: [] as Array<{ email: string; password: string }>,
  signUpCalls: [] as Array<{ email: string; password: string }>,
  upsertProfileCalls: [] as Array<Record<string, unknown>>,
  createdSessions: [] as Array<Record<string, unknown>>,
  sendTripSignals: [] as Array<Record<string, unknown>>,
  ensuredDirectConversations: [] as string[]
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => (store.has(key) ? store.get(key)! : null)),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      store.delete(key);
    })
  }
}));

vi.mock("expo-network", () => ({
  getNetworkStateAsync: vi.fn(async () => ({
    isConnected: network.isConnected,
    isInternetReachable: network.isInternetReachable
  }))
}));

vi.mock("../lib/core/db", () => ({
  upsertProfile: vi.fn(async (payload: Record<string, unknown>) => {
    state.upsertProfileCalls.push(payload);
    return {
      user_id: state.sessionUserId
    };
  }),
  createSessionWithContacts: vi.fn(async (payload: Record<string, unknown>) => {
    state.createdSessions.push(payload);
    return {
      id: `session-${state.createdSessions.length}`,
      from_address: payload.from_address,
      to_address: payload.to_address
    };
  }),
  setSessionLiveShare: vi.fn(async () => ({
    share_live: true,
    share_token: "token"
  }))
}));

vi.mock("../lib/social/messagingDb", () => ({
  sendTripStartedSignalToGuardians: vi.fn(async (payload: Record<string, unknown>) => {
    state.sendTripSignals.push(payload);
    return {
      conversations: 1
    };
  }),
  ensureDirectConversation: vi.fn(async (userId: string) => {
    state.ensuredDirectConversations.push(userId);
    return {
      id: `conversation-${userId}`
    };
  })
}));

vi.mock("../lib/core/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(async ({ email, password }: { email: string; password: string }) => {
        state.signInCalls.push({ email, password });
        return { error: null };
      }),
      signUp: vi.fn(async ({ email, password }: { email: string; password: string }) => {
        state.signUpCalls.push({ email, password });
        return {
          data: {
            session: state.sessionUserId
              ? { user: { id: state.sessionUserId } }
              : null
          },
          error: null
        };
      }),
      getSession: vi.fn(async () => ({
        data: {
          session: state.sessionUserId ? { user: { id: state.sessionUserId } } : null
        }
      }))
    },
    rpc: vi.fn(async (fn: string, params: Record<string, unknown>) => {
      if (fn === "send_friend_request") {
        return {
          data: {
            id: "request-1",
            requester_user_id: state.sessionUserId,
            target_user_id: params.p_target_user_id,
            status: "pending"
          },
          error: null
        };
      }
      if (fn === "respond_friend_request") {
        return {
          data: {
            id: params.p_request_id,
            requester_user_id: "friend-1",
            target_user_id: state.sessionUserId,
            status: params.p_accept ? "accepted" : "rejected"
          },
          error: null
        };
      }
      return {
        data: null,
        error: null
      };
    }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(async () => ({ data: [], error: null }))
      }))
    }))
  }
}));

import { signInWithCredentials, signUpAndMaybeCreateProfile } from "../lib/auth/authFlows";
import { buildSosMessage } from "../lib/safety/sos";
import { sendFriendRequest, respondToFriendRequest } from "../lib/social/friendsDb";
import {
  enqueuePendingTripLaunch,
  listPendingTripLaunches,
  syncPendingTripLaunches
} from "../lib/trips/offlineTripQueue";
import { getFriendOnlineState } from "../lib/social/friendMapStatus";
import {
  getOnboardingAssistantSession,
  resetOnboardingExperience,
  startOnboardingAssistant
} from "../lib/home/onboarding";

describe("core flows e2e", () => {
  beforeEach(() => {
    store.clear();
    network.isConnected = true;
    network.isInternetReachable = true;
    state.sessionUserId = "user-e2e";
    state.signInCalls = [];
    state.signUpCalls = [];
    state.upsertProfileCalls = [];
    state.createdSessions = [];
    state.sendTripSignals = [];
    state.ensuredDirectConversations = [];
    vi.clearAllMocks();
  });

  it("inscription + connexion + onboarding (happy path)", async () => {
    await signUpAndMaybeCreateProfile({
      email: "user@test.com",
      password: "Secret123!",
      profile: {
        username: "romain",
        first_name: "Romain",
        phone: "0600000000"
      }
    });
    await signInWithCredentials({
      identifier: "user@test.com",
      password: "Secret123!"
    });
    await startOnboardingAssistant("user-e2e", "profile");
    const assistant = await getOnboardingAssistantSession("user-e2e");

    expect(state.signUpCalls).toHaveLength(1);
    expect(state.signInCalls).toHaveLength(1);
    expect(state.upsertProfileCalls).toHaveLength(1);
    expect(assistant.active).toBe(true);
    expect(assistant.stepId).toBe("profile");
  });

  it("trajet offline -> sync après réseau rétabli", async () => {
    network.isConnected = false;
    network.isInternetReachable = false;
    await enqueuePendingTripLaunch({
      fromAddress: "Départ A",
      toAddress: "Arrivée B",
      contactIds: ["c1", "c2"],
      expectedArrivalIso: null,
      shareLiveLocation: true
    });

    expect(await listPendingTripLaunches()).toHaveLength(1);

    network.isConnected = true;
    network.isInternetReachable = true;
    const syncResult = await syncPendingTripLaunches();

    expect(syncResult.syncedCount).toBe(1);
    expect(syncResult.failedCount).toBe(0);
    expect(syncResult.remainingCount).toBe(0);
    expect(state.createdSessions).toHaveLength(1);
    expect(state.sendTripSignals).toHaveLength(1);
  });

  it("SOS + amis + map live + reset onboarding", async () => {
    const sos = buildSosMessage({
      currentAddress: "10 Rue de la Paix, Paris",
      coords: { lat: 48.8698, lon: 2.3316 }
    });
    expect(sos.toLowerCase()).toContain("je suis en danger");
    expect(sos).toContain("maps.google.com");

    const request = await sendFriendRequest("friend-1", "Ajoute-moi");
    expect(request.status).toBe("pending");

    const response = await respondToFriendRequest({
      requestId: "request-1",
      accept: true
    });
    expect(response.status).toBe("accepted");
    expect(state.ensuredDirectConversations).toContain("friend-1");

    const onlineState = getFriendOnlineState(
      {
        network_connected: true,
        updated_at: new Date().toISOString()
      },
      Date.now()
    );
    expect(onlineState).toBe("online");

    const reset = await resetOnboardingExperience("user-e2e");
    expect(reset.assistant.active).toBe(false);
    expect(reset.state.completed).toBe(false);
  });
});
