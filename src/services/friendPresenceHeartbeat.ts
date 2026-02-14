// Heartbeat global de presence: maintient un etat reseau recent pour rassurer les proches.
import { AppState } from "react-native";
import { getProfile } from "../lib/core/db";
import { upsertMyFriendMapPresence } from "../lib/social/friendMap";

export async function startFriendPresenceHeartbeat(options?: {
  onInfo?: (message: string) => void;
}): Promise<() => void> {
  let cancelled = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const runPulse = async () => {
    if (cancelled) return;
    if (AppState.currentState !== "active") return;

    try {
      const [{ getNetworkStateAsync }, profile] = await Promise.all([
        import("expo-network"),
        getProfile()
      ]);
      const network = await getNetworkStateAsync();
      await upsertMyFriendMapPresence({
        networkConnected: Boolean(network.isConnected),
        markerEmoji: profile?.map_avatar ?? "🧭"
      });
      options?.onInfo?.(`presence-heartbeat: network=${network.isConnected ? "on" : "off"}`);
    } catch {
      options?.onInfo?.("presence-heartbeat: pulse error");
    }
  };

  await runPulse();
  timer = setInterval(runPulse, 60_000);

  const sub = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      runPulse();
    }
  });

  return () => {
    cancelled = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    sub.remove();
  };
}
