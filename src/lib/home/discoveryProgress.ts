import AsyncStorage from "@react-native-async-storage/async-storage";
import { getOnboardingTutorialSteps } from "./onboardingTutorial";

const DISCOVERY_PROGRESS_VERSION = 1;

export type DiscoveryProgress = {
  version: number;
  visitedRoutes: string[];
  tutorialCurrentStepIndex: number;
  tutorialCompletedStepIds: string[];
  updatedAtIso: string;
};

function discoveryProgressKey(userId: string): string {
  return `safeback:discovery-progress:v${DISCOVERY_PROGRESS_VERSION}:${userId}`;
}

function normalizeRoute(route: string): string {
  const trimmed = String(route ?? "").trim();
  if (!trimmed) return "/";
  const withoutQuery = trimmed.split("?")[0] ?? trimmed;
  if (withoutQuery === "/") return "/";
  return withoutQuery.endsWith("/") ? withoutQuery.slice(0, -1) : withoutQuery;
}

function defaultProgress(): DiscoveryProgress {
  return {
    version: DISCOVERY_PROGRESS_VERSION,
    visitedRoutes: ["/"],
    tutorialCurrentStepIndex: 0,
    tutorialCompletedStepIds: [],
    updatedAtIso: new Date().toISOString()
  };
}

function normalizeProgress(value: unknown): DiscoveryProgress {
  if (!value || typeof value !== "object") return defaultProgress();
  const raw = value as Partial<DiscoveryProgress>;
  return {
    version: DISCOVERY_PROGRESS_VERSION,
    visitedRoutes: Array.isArray(raw.visitedRoutes)
      ? [...new Set(raw.visitedRoutes.map((entry) => normalizeRoute(String(entry ?? ""))))]
      : ["/"],
    tutorialCurrentStepIndex: Math.max(0, Math.round(Number(raw.tutorialCurrentStepIndex ?? 0))),
    tutorialCompletedStepIds: Array.isArray(raw.tutorialCompletedStepIds)
      ? [...new Set(raw.tutorialCompletedStepIds.map((entry) => String(entry ?? "").trim()).filter(Boolean))]
      : [],
    updatedAtIso:
      typeof raw.updatedAtIso === "string" ? raw.updatedAtIso : new Date().toISOString()
  };
}

async function saveProgress(userId: string, progress: DiscoveryProgress): Promise<void> {
  await AsyncStorage.setItem(discoveryProgressKey(userId), JSON.stringify(progress));
}

export async function getDiscoveryProgress(userId: string): Promise<DiscoveryProgress> {
  const raw = await AsyncStorage.getItem(discoveryProgressKey(userId));
  if (!raw) return defaultProgress();
  try {
    return normalizeProgress(JSON.parse(raw));
  } catch {
    return defaultProgress();
  }
}

export async function resetDiscoveryProgress(userId: string): Promise<DiscoveryProgress> {
  const next = defaultProgress();
  await saveProgress(userId, next);
  return next;
}

export async function markRouteVisited(
  userId: string,
  route: string
): Promise<DiscoveryProgress> {
  const normalizedRoute = normalizeRoute(route);
  const current = await getDiscoveryProgress(userId);
  if (current.visitedRoutes.includes(normalizedRoute)) return current;
  const next: DiscoveryProgress = {
    ...current,
    visitedRoutes: [...current.visitedRoutes, normalizedRoute],
    updatedAtIso: new Date().toISOString()
  };
  await saveProgress(userId, next);
  return next;
}

export async function setTutorialCurrentStepIndex(
  userId: string,
  stepIndex: number
): Promise<DiscoveryProgress> {
  const current = await getDiscoveryProgress(userId);
  const next: DiscoveryProgress = {
    ...current,
    tutorialCurrentStepIndex: Math.max(0, Math.round(Number(stepIndex ?? 0))),
    updatedAtIso: new Date().toISOString()
  };
  await saveProgress(userId, next);
  return next;
}

export async function markTutorialStepCompleted(
  userId: string,
  stepId: string
): Promise<DiscoveryProgress> {
  const normalizedStepId = String(stepId ?? "").trim();
  if (!normalizedStepId) return getDiscoveryProgress(userId);
  const current = await getDiscoveryProgress(userId);
  if (current.tutorialCompletedStepIds.includes(normalizedStepId)) return current;
  const next: DiscoveryProgress = {
    ...current,
    tutorialCompletedStepIds: [...current.tutorialCompletedStepIds, normalizedStepId],
    updatedAtIso: new Date().toISOString()
  };
  await saveProgress(userId, next);
  return next;
}

export async function syncTutorialCompletionFromVisitedRoutes(
  userId: string
): Promise<DiscoveryProgress> {
  const current = await getDiscoveryProgress(userId);
  const completedByRoute = getOnboardingTutorialSteps()
    .filter((step) => step.route && current.visitedRoutes.includes(normalizeRoute(step.route)))
    .map((step) => step.id);
  const mergedCompleted = [...new Set([...current.tutorialCompletedStepIds, ...completedByRoute])];
  if (mergedCompleted.length === current.tutorialCompletedStepIds.length) return current;
  const next: DiscoveryProgress = {
    ...current,
    tutorialCompletedStepIds: mergedCompleted,
    updatedAtIso: new Date().toISOString()
  };
  await saveProgress(userId, next);
  return next;
}

export function hasVisitedRoute(visitedRoutes: string[], route: string): boolean {
  const normalizedRoute = normalizeRoute(route);
  return visitedRoutes.some((entry) => normalizeRoute(entry) === normalizedRoute);
}
