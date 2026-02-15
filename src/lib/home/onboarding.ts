import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_VERSION = 2;
const ASSISTANT_VERSION = 1;

export type OnboardingStepId =
  | "profile"
  | "favorites"
  | "contacts"
  | "safety_review"
  | "friends_map"
  | "auto_checkins"
  | "guardian_dashboard"
  | "first_trip";

export const ONBOARDING_STEP_ORDER: OnboardingStepId[] = [
  "profile",
  "favorites",
  "contacts",
  "safety_review",
  "friends_map",
  "auto_checkins",
  "guardian_dashboard",
  "first_trip"
];

export function getOnboardingStepRoute(
  stepId: OnboardingStepId
):
  | "/account"
  | "/favorites"
  | "/safety-alerts"
  | "/friends-map"
  | "/auto-checkins"
  | "/guardian-dashboard"
  | "/setup" {
  if (stepId === "profile") return "/account";
  if (stepId === "favorites") return "/favorites";
  if (stepId === "contacts") return "/favorites";
  if (stepId === "safety_review") return "/safety-alerts";
  if (stepId === "friends_map") return "/friends-map";
  if (stepId === "auto_checkins") return "/auto-checkins";
  if (stepId === "guardian_dashboard") return "/guardian-dashboard";
  return "/setup";
}

export function getNextOnboardingStepId(stepId: OnboardingStepId): OnboardingStepId | null {
  const index = ONBOARDING_STEP_ORDER.indexOf(stepId);
  if (index < 0 || index === ONBOARDING_STEP_ORDER.length - 1) {
    return null;
  }
  return ONBOARDING_STEP_ORDER[index + 1];
}

export type OnboardingState = {
  version: number;
  completed: boolean;
  dismissed: boolean;
  manualDone: string[];
  updatedAtIso: string;
  completedAtIso?: string;
};

export type OnboardingAssistantSession = {
  version: number;
  active: boolean;
  stepId: OnboardingStepId;
  updatedAtIso: string;
};

function onboardingKey(userId: string): string {
  return `safeback:onboarding:v${ONBOARDING_VERSION}:${userId}`;
}

function assistantKey(userId: string): string {
  return `safeback:onboarding-assistant:v${ASSISTANT_VERSION}:${userId}`;
}

function defaultState(): OnboardingState {
  return {
    version: ONBOARDING_VERSION,
    completed: false,
    dismissed: false,
    manualDone: [],
    updatedAtIso: new Date().toISOString()
  };
}

function defaultAssistantSession(): OnboardingAssistantSession {
  return {
    version: ASSISTANT_VERSION,
    active: false,
    stepId: "profile",
    updatedAtIso: new Date().toISOString()
  };
}

function normalizeState(value: unknown): OnboardingState {
  if (!value || typeof value !== "object") return defaultState();
  const raw = value as Partial<OnboardingState>;
  return {
    version: ONBOARDING_VERSION,
    completed: Boolean(raw.completed),
    dismissed: Boolean(raw.dismissed),
    manualDone: Array.isArray(raw.manualDone)
      ? raw.manualDone.filter((entry): entry is string => typeof entry === "string")
      : [],
    updatedAtIso: typeof raw.updatedAtIso === "string" ? raw.updatedAtIso : new Date().toISOString(),
    completedAtIso: typeof raw.completedAtIso === "string" ? raw.completedAtIso : undefined
  };
}

function normalizeAssistantSession(value: unknown): OnboardingAssistantSession {
  if (!value || typeof value !== "object") return defaultAssistantSession();
  const raw = value as Partial<OnboardingAssistantSession>;
  return {
    version: ASSISTANT_VERSION,
    active: Boolean(raw.active),
    stepId:
      typeof raw.stepId === "string" && ONBOARDING_STEP_ORDER.includes(raw.stepId as OnboardingStepId)
        ? (raw.stepId as OnboardingStepId)
        : "profile",
    updatedAtIso:
      typeof raw.updatedAtIso === "string" ? raw.updatedAtIso : new Date().toISOString()
  };
}

async function saveState(userId: string, state: OnboardingState): Promise<void> {
  await AsyncStorage.setItem(onboardingKey(userId), JSON.stringify(state));
}

async function saveAssistantSession(
  userId: string,
  session: OnboardingAssistantSession
): Promise<void> {
  await AsyncStorage.setItem(assistantKey(userId), JSON.stringify(session));
}

export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const raw = await AsyncStorage.getItem(onboardingKey(userId));
  if (!raw) return defaultState();
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

export async function setOnboardingDismissed(userId: string, dismissed: boolean): Promise<OnboardingState> {
  const current = await getOnboardingState(userId);
  const next: OnboardingState = {
    ...current,
    dismissed,
    updatedAtIso: new Date().toISOString()
  };
  await saveState(userId, next);
  return next;
}

export async function markOnboardingManualStep(userId: string, stepId: string): Promise<OnboardingState> {
  const current = await getOnboardingState(userId);
  if (current.manualDone.includes(stepId)) return current;
  const next: OnboardingState = {
    ...current,
    manualDone: [...current.manualDone, stepId],
    updatedAtIso: new Date().toISOString()
  };
  await saveState(userId, next);
  return next;
}

export async function setOnboardingCompleted(userId: string): Promise<OnboardingState> {
  const current = await getOnboardingState(userId);
  const now = new Date().toISOString();
  const next: OnboardingState = {
    ...current,
    completed: true,
    dismissed: true,
    updatedAtIso: now,
    completedAtIso: now
  };
  await saveState(userId, next);
  return next;
}

export async function resetOnboardingState(userId: string): Promise<OnboardingState> {
  // Reset explicite utilisé quand l'utilisateur veut rejouer tout l'assistant depuis l'étape 1.
  const next: OnboardingState = {
    version: ONBOARDING_VERSION,
    completed: false,
    dismissed: false,
    manualDone: [],
    updatedAtIso: new Date().toISOString()
  };
  await saveState(userId, next);
  return next;
}

export async function getOnboardingAssistantSession(
  userId: string
): Promise<OnboardingAssistantSession> {
  const raw = await AsyncStorage.getItem(assistantKey(userId));
  if (!raw) return defaultAssistantSession();
  try {
    return normalizeAssistantSession(JSON.parse(raw));
  } catch {
    return defaultAssistantSession();
  }
}

export async function startOnboardingAssistant(
  userId: string,
  stepId: OnboardingStepId
): Promise<OnboardingAssistantSession> {
  // La session d'assistant pilote les aides contextuelles par page et les transitions automatiques d'étapes.
  const next: OnboardingAssistantSession = {
    version: ASSISTANT_VERSION,
    active: true,
    stepId,
    updatedAtIso: new Date().toISOString()
  };
  await saveAssistantSession(userId, next);
  return next;
}

export async function setOnboardingAssistantStep(
  userId: string,
  stepId: OnboardingStepId
): Promise<OnboardingAssistantSession> {
  const current = await getOnboardingAssistantSession(userId);
  const next: OnboardingAssistantSession = {
    ...current,
    active: true,
    stepId,
    updatedAtIso: new Date().toISOString()
  };
  await saveAssistantSession(userId, next);
  return next;
}

export async function stopOnboardingAssistant(userId: string): Promise<OnboardingAssistantSession> {
  const current = await getOnboardingAssistantSession(userId);
  const next: OnboardingAssistantSession = {
    ...current,
    active: false,
    updatedAtIso: new Date().toISOString()
  };
  await saveAssistantSession(userId, next);
  return next;
}
