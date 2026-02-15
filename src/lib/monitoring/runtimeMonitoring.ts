// Monitoring runtime "equivalent Sentry" :
// - capture des erreurs JS
// - collecte de métriques UX
// - file locale persistante avec flush différé.
import AsyncStorage from "@react-native-async-storage/async-storage";

const RUNTIME_ERRORS_QUEUE_KEY = "safeback:monitoring:runtime-errors:v1";
const UX_METRICS_QUEUE_KEY = "safeback:monitoring:ux-metrics:v1";
const MAX_RUNTIME_ERRORS = 300;
const MAX_UX_METRICS = 800;

export type RuntimeErrorEvent = {
  name: string;
  message: string;
  stack?: string | null;
  fatal: boolean;
  context?: string;
  createdAtIso: string;
  data?: Record<string, unknown> | null;
};

export type UxMetricEvent = {
  name: string;
  value?: number | null;
  durationMs?: number | null;
  context?: string;
  createdAtIso: string;
  data?: Record<string, unknown> | null;
};

type MonitoringQueues = {
  runtimeErrors: RuntimeErrorEvent[];
  uxMetrics: UxMetricEvent[];
};

function normalizeRuntimeErrors(raw: unknown): RuntimeErrorEvent[] {
  if (!Array.isArray(raw)) return [];
  const rows: RuntimeErrorEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = String(row.name ?? "Error").trim() || "Error";
    const message = String(row.message ?? "").trim();
    if (!message) continue;
    rows.push({
      name,
      message,
      stack: typeof row.stack === "string" ? row.stack : null,
      fatal: Boolean(row.fatal),
      context: typeof row.context === "string" ? row.context : undefined,
      createdAtIso:
        typeof row.createdAtIso === "string" && row.createdAtIso.length > 0
          ? row.createdAtIso
          : new Date().toISOString(),
      data:
        row.data && typeof row.data === "object"
          ? (row.data as Record<string, unknown>)
          : null
    });
  }
  return rows;
}

function normalizeUxMetrics(raw: unknown): UxMetricEvent[] {
  if (!Array.isArray(raw)) return [];
  const rows: UxMetricEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    rows.push({
      name,
      value: typeof row.value === "number" ? row.value : null,
      durationMs: typeof row.durationMs === "number" ? row.durationMs : null,
      context: typeof row.context === "string" ? row.context : undefined,
      createdAtIso:
        typeof row.createdAtIso === "string" && row.createdAtIso.length > 0
          ? row.createdAtIso
          : new Date().toISOString(),
      data:
        row.data && typeof row.data === "object"
          ? (row.data as Record<string, unknown>)
          : null
    });
  }
  return rows;
}

async function readQueue<T>(
  key: string,
  normalize: (value: unknown) => T[]
): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function writeQueue<T>(key: string, rows: T[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(rows));
}

export async function readMonitoringQueues(): Promise<MonitoringQueues> {
  const [runtimeErrors, uxMetrics] = await Promise.all([
    readQueue(RUNTIME_ERRORS_QUEUE_KEY, normalizeRuntimeErrors),
    readQueue(UX_METRICS_QUEUE_KEY, normalizeUxMetrics)
  ]);
  return {
    runtimeErrors,
    uxMetrics
  };
}

export async function captureRuntimeError(params: {
  error: unknown;
  context?: string;
  fatal?: boolean;
  data?: Record<string, unknown> | null;
}): Promise<void> {
  const name = String((params.error as { name?: string })?.name ?? "Error").trim() || "Error";
  const message = String((params.error as { message?: string })?.message ?? params.error ?? "").trim();
  if (!message) return;
  const stack = String((params.error as { stack?: string })?.stack ?? "").trim() || null;
  const current = await readQueue(RUNTIME_ERRORS_QUEUE_KEY, normalizeRuntimeErrors);
  const next: RuntimeErrorEvent[] = [
    {
      name,
      message,
      stack,
      fatal: Boolean(params.fatal),
      context: params.context,
      createdAtIso: new Date().toISOString(),
      data: params.data ?? null
    },
    ...current
  ].slice(0, MAX_RUNTIME_ERRORS);
  await writeQueue(RUNTIME_ERRORS_QUEUE_KEY, next);
}

export async function trackUxMetric(params: {
  name: string;
  value?: number;
  durationMs?: number;
  context?: string;
  data?: Record<string, unknown> | null;
}): Promise<void> {
  const name = params.name.trim();
  if (!name) return;
  const current = await readQueue(UX_METRICS_QUEUE_KEY, normalizeUxMetrics);
  const next: UxMetricEvent[] = [
    {
      name,
      value: typeof params.value === "number" ? params.value : null,
      durationMs: typeof params.durationMs === "number" ? params.durationMs : null,
      context: params.context,
      createdAtIso: new Date().toISOString(),
      data: params.data ?? null
    },
    ...current
  ].slice(0, MAX_UX_METRICS);
  await writeQueue(UX_METRICS_QUEUE_KEY, next);
}

export async function drainMonitoringQueues(params?: {
  maxRuntimeErrors?: number;
  maxUxMetrics?: number;
}): Promise<MonitoringQueues> {
  const queues = await readMonitoringQueues();
  const runtimeLimit = Math.max(1, params?.maxRuntimeErrors ?? queues.runtimeErrors.length);
  const uxLimit = Math.max(1, params?.maxUxMetrics ?? queues.uxMetrics.length);

  const runtimeErrors = queues.runtimeErrors.slice(0, runtimeLimit);
  const uxMetrics = queues.uxMetrics.slice(0, uxLimit);

  await writeQueue(
    RUNTIME_ERRORS_QUEUE_KEY,
    queues.runtimeErrors.slice(runtimeErrors.length)
  );
  await writeQueue(UX_METRICS_QUEUE_KEY, queues.uxMetrics.slice(uxMetrics.length));
  return { runtimeErrors, uxMetrics };
}

export async function requeueMonitoringEvents(events: MonitoringQueues): Promise<void> {
  const current = await readMonitoringQueues();
  await writeQueue(
    RUNTIME_ERRORS_QUEUE_KEY,
    [...events.runtimeErrors, ...current.runtimeErrors].slice(0, MAX_RUNTIME_ERRORS)
  );
  await writeQueue(
    UX_METRICS_QUEUE_KEY,
    [...events.uxMetrics, ...current.uxMetrics].slice(0, MAX_UX_METRICS)
  );
}

export function installGlobalRuntimeErrorHandlers(): () => void {
  const globalObject = globalThis as any;
  let previousGlobalHandler: ((error: any, isFatal?: boolean) => void) | null = null;

  // React Native expose ErrorUtils pour capter les erreurs JS globales.
  if (
    globalObject.ErrorUtils &&
    typeof globalObject.ErrorUtils.getGlobalHandler === "function" &&
    typeof globalObject.ErrorUtils.setGlobalHandler === "function"
  ) {
    previousGlobalHandler = globalObject.ErrorUtils.getGlobalHandler();
    globalObject.ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      captureRuntimeError({
        error,
        fatal: Boolean(isFatal),
        context: "global_js_error"
      }).catch(() => {
        // no-op
      });
      if (previousGlobalHandler) {
        previousGlobalHandler(error, isFatal);
      }
    });
  }

  // Garde-fou promesses non gérées.
  const rejectionHandler = (event: any) => {
    const reason = event?.reason ?? event;
    captureRuntimeError({
      error: reason,
      fatal: false,
      context: "unhandled_promise_rejection"
    }).catch(() => {
      // no-op
    });
  };

  if (typeof globalObject.addEventListener === "function") {
    globalObject.addEventListener("unhandledrejection", rejectionHandler);
  } else if (typeof globalObject.process?.on === "function") {
    globalObject.process.on("unhandledRejection", rejectionHandler);
  }

  return () => {
    if (
      previousGlobalHandler &&
      globalObject.ErrorUtils &&
      typeof globalObject.ErrorUtils.setGlobalHandler === "function"
    ) {
      globalObject.ErrorUtils.setGlobalHandler(previousGlobalHandler);
    }
    if (typeof globalObject.removeEventListener === "function") {
      globalObject.removeEventListener("unhandledrejection", rejectionHandler);
    } else if (typeof globalObject.process?.off === "function") {
      globalObject.process.off("unhandledRejection", rejectionHandler);
    }
  };
}
