// Helpers purs (sans IO) pour calculer le statut de presence carte.
export type FriendOnlineState = "online" | "recently_offline" | "offline";

export function normalizeMarkerEmoji(value?: string | null): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "🧭";
  return trimmed.slice(0, 4);
}

export function getFriendOnlineState(
  row: { network_connected?: boolean | null; updated_at?: string | null },
  nowMs = Date.now()
): FriendOnlineState {
  const updatedMs = row.updated_at ? new Date(row.updated_at).getTime() : 0;
  if (!updatedMs || Number.isNaN(updatedMs)) return "offline";

  const ageMs = Math.max(0, nowMs - updatedMs);
  const hasFreshHeartbeat = ageMs <= 2 * 60 * 1000;
  const hasRecentHeartbeat = ageMs <= 10 * 60 * 1000;

  if (row.network_connected && hasFreshHeartbeat) {
    return "online";
  }
  if (hasRecentHeartbeat) {
    return "recently_offline";
  }
  return "offline";
}
