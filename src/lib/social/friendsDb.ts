// API sociale : profils publics, amitiés, demandes d'ami et helpers de normalisation.
import { ensureDirectConversation } from "./messagingDb";
import { supabase } from "../core/supabase";

export type PublicProfile = {
  user_id: string;
  public_id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export type FriendRequest = {
  id: string;
  requester_user_id: string;
  target_user_id: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  message?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type FriendRequestWithProfiles = FriendRequest & {
  direction: "incoming" | "outgoing";
  requesterProfile?: PublicProfile;
  targetProfile?: PublicProfile;
};

export type FriendRow = {
  id: string;
  user_id: string;
  friend_user_id: string;
  source_request_id?: string | null;
  created_at?: string;
};

export type FriendWithProfile = FriendRow & {
  profile?: PublicProfile;
};

async function requireUserId(): Promise<string> {
  const session = await supabase.auth.getSession();
  const userId = session.data.session?.user.id;
  if (!userId) throw new Error("Utilisateur non authentifie.");
  return userId;
}

function normalizePublicProfile(value: any): PublicProfile {
  return {
    user_id: String(value?.user_id ?? ""),
    public_id: String(value?.public_id ?? ""),
    username: value?.username ?? null,
    first_name: value?.first_name ?? null,
    last_name: value?.last_name ?? null
  };
}

export async function ensureMyPublicProfile(): Promise<PublicProfile> {
  const { data: ensured, error: ensureError } = await supabase.rpc("ensure_profile_public_id");
  if (ensureError) throw ensureError;
  const ensuredRow = Array.isArray(ensured) ? ensured[0] : ensured;
  const normalizedEnsured = normalizePublicProfile(ensuredRow);
  if (normalizedEnsured.user_id && normalizedEnsured.public_id) {
    return normalizedEnsured;
  }

  const userId = await requireUserId();
  const profiles = await getPublicProfilesByUserIds([userId]);
  const profile = profiles.find((row) => row.user_id === userId);
  if (!profile) {
    throw new Error("Impossible de recuperer le profil public.");
  }
  return profile;
}

export async function getPublicProfilesByUserIds(userIds: string[]): Promise<PublicProfile[]> {
  if (!userIds.length) return [];
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return [];
  const { data, error } = await supabase.rpc("get_public_profiles", {
    p_user_ids: uniqueIds
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map(normalizePublicProfile).filter((row) => row.user_id && row.public_id);
}

export async function searchPublicProfiles(query: string, limit = 20): Promise<PublicProfile[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  const { data, error } = await supabase.rpc("search_public_profiles", {
    p_query: normalizedQuery,
    p_limit: Math.max(1, Math.min(50, limit))
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map(normalizePublicProfile).filter((row) => row.user_id && row.public_id);
}

export async function sendFriendRequest(targetUserId: string, message?: string): Promise<FriendRequest> {
  const { data, error } = await supabase.rpc("send_friend_request", {
    p_target_user_id: targetUserId,
    p_message: message?.trim() || null
  });
  if (error) throw error;
  return data as FriendRequest;
}

export async function respondToFriendRequest(params: {
  requestId: string;
  accept: boolean;
  autoOpenConversation?: boolean;
}): Promise<FriendRequest> {
  const { data, error } = await supabase.rpc("respond_friend_request", {
    p_request_id: params.requestId,
    p_accept: params.accept
  });
  if (error) throw error;
  const request = data as FriendRequest;
  if (params.accept && params.autoOpenConversation !== false) {
    const me = await requireUserId();
    const otherUserId = request.requester_user_id === me ? request.target_user_id : request.requester_user_id;
    if (otherUserId) {
      await ensureDirectConversation(otherUserId);
    }
  }
  return request;
}

export async function listFriendRequests(): Promise<FriendRequestWithProfiles[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("friend_requests")
    .select("*")
    .or(`requester_user_id.eq.${userId},target_user_id.eq.${userId}`)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as FriendRequest[];
  if (!rows.length) return [];
  const profileIds = new Set<string>();
  for (const row of rows) {
    profileIds.add(row.requester_user_id);
    profileIds.add(row.target_user_id);
  }
  const profiles = await getPublicProfilesByUserIds([...profileIds]);
  const profilesMap = new Map(profiles.map((profile) => [profile.user_id, profile]));

  return rows.map((row) => ({
    ...row,
    direction: row.target_user_id === userId ? "incoming" : "outgoing",
    requesterProfile: profilesMap.get(row.requester_user_id),
    targetProfile: profilesMap.get(row.target_user_id)
  }));
}

export async function listFriends(): Promise<FriendWithProfile[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as FriendRow[];
  if (!rows.length) return [];
  const profiles = await getPublicProfilesByUserIds(rows.map((row) => row.friend_user_id));
  const profilesMap = new Map(profiles.map((profile) => [profile.user_id, profile]));

  return rows.map((row) => ({
    ...row,
    profile: profilesMap.get(row.friend_user_id)
  }));
}
