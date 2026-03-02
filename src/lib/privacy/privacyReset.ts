import { disableAllLiveShareSessions, upsertProfile } from "../core/db";
import { clearPendingTripQueue, getPendingTripQueueCount } from "../trips/offlineTripQueue";
import { clearPrivacyEvents, logPrivacyEvent } from "./privacyCenter";
import {
  DEFAULT_SAFETY_ESCALATION_CONFIG,
  setSafetyEscalationConfig
} from "../safety/safetyEscalation";
import { clearAutoCheckinConfig, clearAutoCheckinDetectorState } from "../safety/autoCheckins";

export async function runPrivacyReset(): Promise<{
  disabledLiveShareCount: number;
  clearedOfflineQueueCount: number;
}> {
  // Reset confidentialité en'action unique pour l'UI : coupe les partages, désactive les demandes garants, vide les envois différés.
  const clearedOfflineQueueCount = await getPendingTripQueueCount();
  await clearPendingTripQueue();
  // Reset explicite de l'escalade en mode protection minimale après réinitialisation confidentialité.
  await setSafetyEscalationConfig({
    enabled: false,
    reminderDelayMinutes: DEFAULT_SAFETY_ESCALATION_CONFIG.stageOneDelayMinutes,
    closeContactsDelayMinutes: DEFAULT_SAFETY_ESCALATION_CONFIG.stageTwoDelayMinutes,
    stageOneDelayMinutes: DEFAULT_SAFETY_ESCALATION_CONFIG.stageOneDelayMinutes,
    stageTwoDelayMinutes: DEFAULT_SAFETY_ESCALATION_CONFIG.stageTwoDelayMinutes,
    stageThreeDelayMinutes: DEFAULT_SAFETY_ESCALATION_CONFIG.stageThreeDelayMinutes,
    stageOneMode: DEFAULT_SAFETY_ESCALATION_CONFIG.stageOneMode,
    stageTwoMode: DEFAULT_SAFETY_ESCALATION_CONFIG.stageTwoMode,
    stageThreeMode: DEFAULT_SAFETY_ESCALATION_CONFIG.stageThreeMode,
    secureArrivalEnabled: false,
    secureArrivalRequireLocation: DEFAULT_SAFETY_ESCALATION_CONFIG.secureArrivalRequireLocation,
    secureArrivalRequireCharging: false,
    secureArrivalMinTripMinutes: DEFAULT_SAFETY_ESCALATION_CONFIG.secureArrivalMinTripMinutes
  });
  await upsertProfile({
    allow_guardian_check_requests: false
  });
  await clearAutoCheckinConfig();
  await clearAutoCheckinDetectorState();
  const disabledLiveShareCount = await disableAllLiveShareSessions();
  await clearPrivacyEvents();
  await logPrivacyEvent({
    type: "privacy_reset",
    message: "Centre de confidentialité réinitialisé en 1 clic.",
    data: {
      disabled_live_share_count: disabledLiveShareCount,
      cleared_offline_queue_count: clearedOfflineQueueCount
    }
  });
  return {
    disabledLiveShareCount,
    clearedOfflineQueueCount
  };
}
