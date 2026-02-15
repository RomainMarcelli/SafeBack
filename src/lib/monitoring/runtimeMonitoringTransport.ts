// Transport Supabase pour le monitoring runtime/UX.
import { supabase } from "../core/supabase";
import { getOrCreateCurrentDeviceId } from "../security/deviceSessions";
import {
  drainMonitoringQueues,
  requeueMonitoringEvents,
  type RuntimeErrorEvent,
  type UxMetricEvent
} from "./runtimeMonitoring";

export async function flushMonitoringToSupabase(params?: {
  maxRuntimeErrors?: number;
  maxUxMetrics?: number;
}): Promise<{
  sentRuntimeErrors: number;
  sentUxMetrics: number;
  skipped: boolean;
}> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) {
    return {
      sentRuntimeErrors: 0,
      sentUxMetrics: 0,
      skipped: true
    };
  }

  try {
    const Network = await import("expo-network");
    const state = await Network.getNetworkStateAsync();
    if (state.isConnected === false || state.isInternetReachable === false) {
      return {
        sentRuntimeErrors: 0,
        sentUxMetrics: 0,
        skipped: true
      };
    }
  } catch {
    // no-op : si l'état réseau n'est pas disponible, on tente quand même.
  }

  const queue = await drainMonitoringQueues(params);
  if (queue.runtimeErrors.length === 0 && queue.uxMetrics.length === 0) {
    return {
      sentRuntimeErrors: 0,
      sentUxMetrics: 0,
      skipped: false
    };
  }

  const deviceId = await getOrCreateCurrentDeviceId().catch(() => null);

  const runtimeRows = queue.runtimeErrors.map((event) => ({
    user_id: userId,
    device_id: deviceId,
    error_name: event.name,
    error_message: event.message,
    stack: event.stack ?? null,
    fatal: event.fatal,
    context: event.context ?? null,
    data: event.data ?? null,
    created_at: event.createdAtIso
  }));

  const metricRows = queue.uxMetrics.map((event) => ({
    user_id: userId,
    device_id: deviceId,
    metric_name: event.name,
    metric_value: event.value ?? null,
    duration_ms: event.durationMs ?? null,
    context: event.context ?? null,
    data: event.data ?? null,
    created_at: event.createdAtIso
  }));

  let runtimeError: unknown = null;
  let metricError: unknown = null;

  if (runtimeRows.length > 0) {
    const response = await supabase.from("runtime_error_events").insert(runtimeRows);
    runtimeError = response.error;
  }
  if (metricRows.length > 0) {
    const response = await supabase.from("ux_metric_events").insert(metricRows);
    metricError = response.error;
  }

  if (runtimeError || metricError) {
    await requeueMonitoringEvents({
      runtimeErrors: runtimeError ? queue.runtimeErrors : [],
      uxMetrics: metricError ? queue.uxMetrics : []
    });
    throw runtimeError || metricError;
  }

  return {
    sentRuntimeErrors: runtimeRows.length,
    sentUxMetrics: metricRows.length,
    skipped: false
  };
}
