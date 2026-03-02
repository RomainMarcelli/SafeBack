import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import { createSessionWithContacts, setSessionLiveShare } from "../core/db";
import { createLiveShareToken } from "./liveShare";
import { sendTripStartedSignalToGuardians } from "../social/messagingDb";
import { logPrivacyEvent } from "../privacy/privacyCenter";
import { supabase } from "../core/supabase";

const OFFLINE_TRIP_QUEUE_KEY = "safeback:offline_trip_queue";

export type PendingTripLaunch = {
  id: string;
  createdAtIso: string;
  fromAddress: string;
  toAddress: string;
  contactIds: string[];
  expectedArrivalIso?: string | null;
  shareLiveLocation: boolean;
};

type PendingTripSyncResult = {
  syncedCount: number;
  failedCount: number;
  remainingCount: number;
};

// Garde un payload de stockage défensif : les lignes anciennes/corrompues sont ignorées au lieu de casser la synchro.
function normalizePendingTrips(raw: unknown): PendingTripLaunch[] {
  if (!Array.isArray(raw)) return [];
  const normalized: PendingTripLaunch[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    const fromAddress = String(row.fromAddress ?? "").trim();
    const toAddress = String(row.toAddress ?? "").trim();
    const createdAtIso = String(row.createdAtIso ?? "").trim();
    if (!id || !fromAddress || !toAddress || !createdAtIso) continue;
    const contactIds = Array.isArray(row.contactIds)
      ? row.contactIds.map((value) => String(value ?? "").trim()).filter((value) => value.length > 0)
      : [];
    normalized.push({
      id,
      createdAtIso,
      fromAddress,
      toAddress,
      contactIds,
      expectedArrivalIso:
        typeof row.expectedArrivalIso === "string" && row.expectedArrivalIso.trim().length > 0
          ? row.expectedArrivalIso
          : null,
      shareLiveLocation: Boolean(row.shareLiveLocation)
    });
  }
  return normalized;
}

async function savePendingTrips(items: PendingTripLaunch[]): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_TRIP_QUEUE_KEY, JSON.stringify(items));
}

async function readPendingTrips(): Promise<PendingTripLaunch[]> {
  const raw = await AsyncStorage.getItem(OFFLINE_TRIP_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return normalizePendingTrips(parsed);
  } catch {
    return [];
  }
}

export async function enqueuePendingTripLaunch(payload: {
  fromAddress: string;
  toAddress: string;
  contactIds: string[];
  expectedArrivalIso?: string | null;
  shareLiveLocation: boolean;
}): Promise<PendingTripLaunch> {
  // Met les éléments en file locale pour préserver l'UX quand le réseau est instable.
  const entry: PendingTripLaunch = {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAtIso: new Date().toISOString(),
    fromAddress: payload.fromAddress.trim(),
    toAddress: payload.toAddress.trim(),
    contactIds: payload.contactIds,
    expectedArrivalIso: payload.expectedArrivalIso ?? null,
    shareLiveLocation: payload.shareLiveLocation
  };
  const current = await readPendingTrips();
  const next = [entry, ...current].slice(0, 50);
  await savePendingTrips(next);
  await logPrivacyEvent({
    type: "offline_trip_queued",
    message: "Trajet enregistre hors ligne. Envoi differe a la reconnexion.",
    data: {
      pending_id: entry.id
    }
  });
  return entry;
}

export async function listPendingTripLaunches(): Promise<PendingTripLaunch[]> {
  return readPendingTrips();
}

export async function getPendingTripQueueCount(): Promise<number> {
  const rows = await readPendingTrips();
  return rows.length;
}

export async function clearPendingTripQueue(): Promise<void> {
  await AsyncStorage.removeItem(OFFLINE_TRIP_QUEUE_KEY);
}

export async function syncPendingTripLaunches(): Promise<PendingTripSyncResult> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user) {
    const rows = await readPendingTrips();
    return {
      syncedCount: 0,
      failedCount: 0,
      remainingCount: rows.length
    };
  }

  const network = await Network.getNetworkStateAsync();
  if (network.isInternetReachable === false || network.isConnected === false) {
    const rows = await readPendingTrips();
    return {
      syncedCount: 0,
      failedCount: 0,
      remainingCount: rows.length
    };
  }

  const pendingRows = await readPendingTrips();
  if (pendingRows.length === 0) {
    return {
      syncedCount: 0,
      failedCount: 0,
      remainingCount: 0
    };
  }

  let syncedCount = 0;
  let failedCount = 0;
  const nextQueue: PendingTripLaunch[] = [];

  for (const row of pendingRows) {
    try {
      // Rejoue le lancement différé comme en ligne : session + partage optionnel + signal au garant.
      const session = await createSessionWithContacts({
        from_address: row.fromAddress,
        to_address: row.toAddress,
        contactIds: row.contactIds,
        expected_arrival_time: row.expectedArrivalIso ?? null
      });
      if (row.shareLiveLocation) {
        await setSessionLiveShare({
          sessionId: session.id,
          enabled: true,
          shareToken: createLiveShareToken()
        });
      }
      await sendTripStartedSignalToGuardians({
        sessionId: session.id,
        fromAddress: row.fromAddress,
        toAddress: row.toAddress,
        expectedArrivalIso: row.expectedArrivalIso ?? null
      });
      syncedCount += 1;
      await logPrivacyEvent({
        type: "offline_trip_synced",
        message: "Trajet hors ligne synchronise et alertes envoyées.",
        data: {
          pending_id: row.id,
          session_id: session.id
        }
      });
    } catch {
      failedCount += 1;
      nextQueue.push(row);
    }
  }

  await savePendingTrips(nextQueue);
  return {
    syncedCount,
    failedCount,
    remainingCount: nextQueue.length
  };
}
