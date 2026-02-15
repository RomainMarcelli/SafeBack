// Métriques onboarding : temps de config et abandon d'étape.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trackUxMetric } from "./runtimeMonitoring";
import type { OnboardingStepId } from "../home/onboarding";

const ONBOARDING_CONFIG_SESSION_KEY = (userId: string) =>
  `safeback:monitoring:onboarding:config-session:v1:${userId}`;
const ONBOARDING_CURRENT_STEP_KEY = (userId: string) =>
  `safeback:monitoring:onboarding:current-step:v1:${userId}`;

type StepTrackingState = {
  stepId: OnboardingStepId;
  startedAtIso: string;
};

function parseIsoDurationMs(startedAtIso: string): number {
  const startedMs = Date.parse(startedAtIso);
  if (!Number.isFinite(startedMs)) return 0;
  return Math.max(0, Date.now() - startedMs);
}

async function readStepState(userId: string): Promise<StepTrackingState | null> {
  const raw = await AsyncStorage.getItem(ONBOARDING_CURRENT_STEP_KEY(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StepTrackingState>;
    if (!parsed.stepId || !parsed.startedAtIso) return null;
    return {
      stepId: parsed.stepId,
      startedAtIso: parsed.startedAtIso
    };
  } catch {
    return null;
  }
}

async function writeStepState(userId: string, state: StepTrackingState): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_CURRENT_STEP_KEY(userId), JSON.stringify(state));
}

async function clearStepState(userId: string): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_CURRENT_STEP_KEY(userId));
}

export async function startOnboardingConfigSession(userId: string): Promise<void> {
  const key = ONBOARDING_CONFIG_SESSION_KEY(userId);
  const existing = await AsyncStorage.getItem(key);
  if (existing) return;
  const startedAtIso = new Date().toISOString();
  await AsyncStorage.setItem(key, startedAtIso);
  await trackUxMetric({
    name: "onboarding_config_started",
    context: "onboarding",
    data: { userId }
  });
}

export async function completeOnboardingConfigSession(userId: string): Promise<void> {
  const key = ONBOARDING_CONFIG_SESSION_KEY(userId);
  const startedAtIso = await AsyncStorage.getItem(key);
  if (startedAtIso) {
    await trackUxMetric({
      name: "onboarding_config_completed",
      context: "onboarding",
      durationMs: parseIsoDurationMs(startedAtIso),
      data: { userId }
    });
  }
  await AsyncStorage.removeItem(key);
  await clearStepState(userId);
}

export async function abandonOnboardingConfigSession(
  userId: string,
  reason: string
): Promise<void> {
  const key = ONBOARDING_CONFIG_SESSION_KEY(userId);
  const startedAtIso = await AsyncStorage.getItem(key);
  if (!startedAtIso) return;
  await trackUxMetric({
    name: "onboarding_config_abandoned",
    context: "onboarding",
    durationMs: parseIsoDurationMs(startedAtIso),
    data: { userId, reason }
  });
  await AsyncStorage.removeItem(key);
  await clearStepState(userId);
}

export async function startOnboardingStepMetric(
  userId: string,
  stepId: OnboardingStepId
): Promise<void> {
  const current = await readStepState(userId);
  if (current && current.stepId === stepId) return;
  if (current && current.stepId !== stepId) {
    await abandonOnboardingStepMetric(userId, current.stepId, "step_switched");
  }
  const next: StepTrackingState = {
    stepId,
    startedAtIso: new Date().toISOString()
  };
  await writeStepState(userId, next);
  await trackUxMetric({
    name: "onboarding_step_started",
    context: stepId,
    data: { userId, stepId }
  });
}

export async function completeOnboardingStepMetric(
  userId: string,
  stepId: OnboardingStepId
): Promise<void> {
  const current = await readStepState(userId);
  const startedAtIso = current?.stepId === stepId ? current.startedAtIso : new Date().toISOString();
  await trackUxMetric({
    name: "onboarding_step_completed",
    context: stepId,
    durationMs: parseIsoDurationMs(startedAtIso),
    data: { userId, stepId }
  });
  if (current?.stepId === stepId) {
    await clearStepState(userId);
  }
}

export async function abandonOnboardingStepMetric(
  userId: string,
  stepId: OnboardingStepId,
  reason: string
): Promise<void> {
  const current = await readStepState(userId);
  const startedAtIso = current?.stepId === stepId ? current.startedAtIso : new Date().toISOString();
  await trackUxMetric({
    name: "onboarding_step_abandoned",
    context: stepId,
    durationMs: parseIsoDurationMs(startedAtIso),
    data: { userId, stepId, reason }
  });
  if (current?.stepId === stepId) {
    await clearStepState(userId);
  }
}

export async function clearOnboardingMonitoringState(userId: string): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_CONFIG_SESSION_KEY(userId));
  await clearStepState(userId);
}
