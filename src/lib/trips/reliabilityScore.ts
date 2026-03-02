import { listSessions } from "../core/db";
import { listSecurityTimelineEvents } from "../social/messagingDb";

export type ReliabilityScoreLevel = "excellent" | "good" | "fragile" | "critical";

export type ReliabilityMetrics = {
  trips: number;
  arrivalConfirmations: number;
  sosAlerts: number;
  delayChecks: number;
  lowBatteryAlerts: number;
};

export type ReliabilityScore = {
  score: number;
  level: ReliabilityScoreLevel;
  metrics: ReliabilityMetrics;
  recommendations: string[];
};

export type DailySafetyPoint = {
  dayLabel: string;
  score: number;
  tripCount: number;
};

export type PersonalSafetyScore = ReliabilityScore & {
  weeklyTrend: DailySafetyPoint[];
  weeklyGoal: {
    targetScore: number;
    daysMeetingTarget: number;
    completed: boolean;
  };
};

export function computeReliabilityScore(metrics: ReliabilityMetrics): ReliabilityScore {
  // Le score de base démarre optimiste puis diminue selon les signaux de risque.
  let score = 100;

  score -= Math.min(metrics.sosAlerts * 18, 54);
  score -= Math.min(metrics.delayChecks * 8, 24);
  score -= Math.min(metrics.lowBatteryAlerts * 6, 18);

  if (metrics.trips > 0) {
    const arrivalRate = metrics.arrivalConfirmations / metrics.trips;
    if (arrivalRate >= 0.9) score += 4;
    if (arrivalRate < 0.6) score -= 15;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const level: ReliabilityScoreLevel =
    score >= 85 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fragile" : "critical";

  const recommendations: string[] = [];
  if (metrics.lowBatteryAlerts > 0) {
    recommendations.push("Active le mode economie d energie et pars avec au moins 30% de batterie.");
  }
  if (metrics.delayChecks > 1) {
    recommendations.push("Definis une heure d'arrivée plus realiste pour reduire les alertes de retard.");
  }
  if (metrics.sosAlerts > 0) {
    recommendations.push("Mets a jour tes zones favorites et tes garants pour etre mieux couvre.");
  }
  if (metrics.trips > 0 && metrics.arrivalConfirmations < metrics.trips) {
    recommendations.push("Pense a confirmer systematiquement ton'arrivée.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Configuration saine: continue ainsi.");
  }

  return {
    score,
    level,
    metrics,
    recommendations
  };
}

export async function getReliabilityScore(): Promise<ReliabilityScore> {
  // Combine l'historique persistant des trajets et les événements sécurité de la timeline en un signal unique.
  const [sessions, timeline] = await Promise.all([listSessions(), listSecurityTimelineEvents(400)]);
  const metrics: ReliabilityMetrics = {
    trips: sessions.length,
    arrivalConfirmations: timeline.filter((item) => item.type === "arrival_confirmation").length,
    sosAlerts: timeline.filter((item) => item.type === "sos").length,
    delayChecks: timeline.filter((item) => item.type === "delay_check").length,
    lowBatteryAlerts: timeline.filter((item) => item.type === "low_battery").length
  };
  return computeReliabilityScore(metrics);
}

function startOfDayMs(value: string): number {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayLabelFromMs(valueMs: number): string {
  const date = new Date(valueMs);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

export function buildWeeklySafetyTrend(params: {
  sessions: Array<{ created_at?: string }>;
  timeline: Array<{ type: string; created_at: string }>;
  now?: Date;
}): DailySafetyPoint[] {
  const now = params.now ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const points: DailySafetyPoint[] = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const startMs = today - offset * dayMs;
    const endMs = startMs + dayMs;

    const daySessions = params.sessions.filter((session) => {
      if (!session.created_at) return false;
      const value = new Date(session.created_at).getTime();
      return value >= startMs && value < endMs;
    });

    const dayTimeline = params.timeline.filter((event) => {
      const value = new Date(event.created_at).getTime();
      return value >= startMs && value < endMs;
    });

    const score = computeReliabilityScore({
      trips: daySessions.length,
      arrivalConfirmations: dayTimeline.filter((item) => item.type === "arrival_confirmation").length,
      sosAlerts: dayTimeline.filter((item) => item.type === "sos").length,
      delayChecks: dayTimeline.filter((item) => item.type === "delay_check").length,
      lowBatteryAlerts: dayTimeline.filter((item) => item.type === "low_battery").length
    }).score;

    points.push({
      dayLabel: dayLabelFromMs(startMs),
      score,
      tripCount: daySessions.length
    });
  }

  return points;
}

export async function getPersonalSafetyScore(): Promise<PersonalSafetyScore> {
  const [sessions, timeline] = await Promise.all([listSessions(), listSecurityTimelineEvents(400)]);
  const base = computeReliabilityScore({
    trips: sessions.length,
    arrivalConfirmations: timeline.filter((item) => item.type === "arrival_confirmation").length,
    sosAlerts: timeline.filter((item) => item.type === "sos").length,
    delayChecks: timeline.filter((item) => item.type === "delay_check").length,
    lowBatteryAlerts: timeline.filter((item) => item.type === "low_battery").length
  });

  const weeklyTrend = buildWeeklySafetyTrend({ sessions, timeline });
  const targetScore = 75;
  const daysMeetingTarget = weeklyTrend.filter((point) => point.score >= targetScore).length;

  return {
    ...base,
    weeklyTrend,
    weeklyGoal: {
      targetScore,
      daysMeetingTarget,
      completed: daysMeetingTarget >= 5
    }
  };
}
