// Couche de données pour la carte des proches: presence reseau, position et statut lisible UI.
import { supabase } from "../core/supabase";
import { getFriendOnlineState, normalizeMarkerEmoji, type FriendOnlineState } from "./friendMapStatus";

export type FriendMapPresence = {
  user_id: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  marker_emoji?: string | null;
  network_connected?: boolean | null;
  updated_at?: string | null;
};

export { getFriendOnlineState, normalizeMarkerEmoji, type FriendOnlineState };

async function requireUserId(): Promise<string> {
  const session = await supabase.auth.getSession();
  const userId = session.data.session?.user.id;
  if (!userId) throw new Error("Utilisateur non'authentifie.");
  return userId;
}

export async function upsertMyFriendMapPresence(params: {
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  markerEmoji?: string | null;
  networkConnected: boolean;
}): Promise<FriendMapPresence> {
  const userId = await requireUserId();
  const payload = {
    user_id: userId,
    latitude: params.latitude ?? null,
    longitude: params.longitude ?? null,
    accuracy: params.accuracy ?? null,
    marker_emoji: normalizeMarkerEmoji(params.markerEmoji ?? null),
    network_connected: Boolean(params.networkConnected),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("friend_map_presence")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as FriendMapPresence;
}

export async function listFriendMapPresence(userIds: string[]): Promise<FriendMapPresence[]> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return [];

  const { data, error } = await supabase
    .from("friend_map_presence")
    .select("*")
    .in("user_id", uniqueIds)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FriendMapPresence[];
}
