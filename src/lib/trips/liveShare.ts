export type SharedLocationPoint = {
  latitude: number;
  longitude: number;
  recordedAt?: string | null;
};

export function createLiveShareToken(): string {
  const random = Math.random().toString(36).slice(2, 10);
  const now = Date.now().toString(36);
  return `${now}${random}`;
}

export function buildFriendViewLink(params: {
  sessionId: string;
  shareToken: string;
  scheme?: string;
}): string {
  const scheme = params.scheme ?? "safeback";
  return `${scheme}://friend-view?sessionId=${encodeURIComponent(
    params.sessionId
  )}&shareToken=${encodeURIComponent(params.shareToken)}`;
}

export function normalizeSharedLocationPoints(
  points: SharedLocationPoint[]
): SharedLocationPoint[] {
  return [...points]
    .filter(
      (point) =>
        Number.isFinite(point.latitude) &&
        Number.isFinite(point.longitude) &&
        Math.abs(point.latitude) <= 90 &&
        Math.abs(point.longitude) <= 180
    )
    .sort((a, b) => {
      const aTime = a.recordedAt ? new Date(a.recordedAt).getTime() : 0;
      const bTime = b.recordedAt ? new Date(b.recordedAt).getTime() : 0;
      return aTime - bTime;
    });
}
