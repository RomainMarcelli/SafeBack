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
    recommendations.push("Definis une heure d'arrivee plus realiste pour reduire les alertes de retard.");
  }
  if (metrics.sosAlerts > 0) {
    recommendations.push("Mets a jour tes zones favorites et tes garants pour etre mieux couvre.");
  }
  if (metrics.trips > 0 && metrics.arrivalConfirmations < metrics.trips) {
    recommendations.push("Pense a confirmer systematiquement ton arrivee.");
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
