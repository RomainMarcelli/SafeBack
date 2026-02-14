import { disableAllLiveShareSessions, upsertProfile } from "../core/db";
import { clearPendingTripQueue, getPendingTripQueueCount } from "../trips/offlineTripQueue";
import { clearPrivacyEvents, logPrivacyEvent } from "./privacyCenter";
import { setSafetyEscalationConfig } from "../safety/safetyEscalation";
import { clearAutoCheckinConfig, clearAutoCheckinDetectorState } from "../safety/autoCheckins";

export async function runPrivacyReset(): Promise<{
  disabledLiveShareCount: number;
  clearedOfflineQueueCount: number;
}> {
  // Reset confidentialité en action unique pour l'UI : coupe les partages, désactive les demandes garants, vide les envois différés.
  const clearedOfflineQueueCount = await getPendingTripQueueCount();
  await clearPendingTripQueue();
  await setSafetyEscalationConfig({
    enabled: false,
    reminderDelayMinutes: 30,
    closeContactsDelayMinutes: 120
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
    message: "Centre de confidentialite reinitialise en 1 clic.",
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
