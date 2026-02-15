// Tests unitaires pour valider le comportement de `privacyReset` et prévenir les régressions.
import { beforeEach, describe, expect, it, vi } from "vitest";

const getPendingTripQueueCountMock = vi.hoisted(() => vi.fn());
const clearPendingTripQueueMock = vi.hoisted(() => vi.fn());
const setSafetyEscalationConfigMock = vi.hoisted(() => vi.fn());
const upsertProfileMock = vi.hoisted(() => vi.fn());
const disableAllLiveShareSessionsMock = vi.hoisted(() => vi.fn());
const clearAutoCheckinConfigMock = vi.hoisted(() => vi.fn());
const clearAutoCheckinDetectorStateMock = vi.hoisted(() => vi.fn());
const clearPrivacyEventsMock = vi.hoisted(() => vi.fn());
const logPrivacyEventMock = vi.hoisted(() => vi.fn());

vi.mock("../trips/offlineTripQueue", () => ({
  getPendingTripQueueCount: getPendingTripQueueCountMock,
  clearPendingTripQueue: clearPendingTripQueueMock
}));

vi.mock("../safety/safetyEscalation", () => ({
  setSafetyEscalationConfig: setSafetyEscalationConfigMock,
  DEFAULT_SAFETY_ESCALATION_CONFIG: {
    enabled: true,
    reminderDelayMinutes: 10,
    closeContactsDelayMinutes: 20,
    stageOneDelayMinutes: 10,
    stageTwoDelayMinutes: 20,
    stageThreeDelayMinutes: 30,
    stageOneMode: "in_app",
    stageTwoMode: "push",
    stageThreeMode: "sms",
    secureArrivalEnabled: false,
    secureArrivalRequireLocation: true,
    secureArrivalRequireCharging: false,
    secureArrivalMinTripMinutes: 3
  }
}));

vi.mock("../core/db", () => ({
  upsertProfile: upsertProfileMock,
  disableAllLiveShareSessions: disableAllLiveShareSessionsMock
}));

vi.mock("../safety/autoCheckins", () => ({
  clearAutoCheckinConfig: clearAutoCheckinConfigMock,
  clearAutoCheckinDetectorState: clearAutoCheckinDetectorStateMock
}));

vi.mock("./privacyCenter", () => ({
  clearPrivacyEvents: clearPrivacyEventsMock,
  logPrivacyEvent: logPrivacyEventMock
}));

import { runPrivacyReset } from "./privacyReset";

describe("privacyReset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPendingTripQueueCountMock.mockResolvedValue(3);
    clearPendingTripQueueMock.mockResolvedValue(undefined);
    setSafetyEscalationConfigMock.mockResolvedValue(undefined);
    upsertProfileMock.mockResolvedValue({});
    clearAutoCheckinConfigMock.mockResolvedValue(undefined);
    clearAutoCheckinDetectorStateMock.mockResolvedValue(undefined);
    disableAllLiveShareSessionsMock.mockResolvedValue(2);
    clearPrivacyEventsMock.mockResolvedValue(undefined);
    logPrivacyEventMock.mockResolvedValue(undefined);
  });

  it("resets privacy-sensitive state in one call", async () => {
    const result = await runPrivacyReset();

    expect(result).toEqual({
      disabledLiveShareCount: 2,
      clearedOfflineQueueCount: 3
    });
    expect(clearPendingTripQueueMock).toHaveBeenCalledTimes(1);
    expect(setSafetyEscalationConfigMock).toHaveBeenCalledWith({
      enabled: false,
      reminderDelayMinutes: 10,
      closeContactsDelayMinutes: 20,
      stageOneDelayMinutes: 10,
      stageTwoDelayMinutes: 20,
      stageThreeDelayMinutes: 30,
      stageOneMode: "in_app",
      stageTwoMode: "push",
      stageThreeMode: "sms",
      secureArrivalEnabled: false,
      secureArrivalRequireLocation: true,
      secureArrivalRequireCharging: false,
      secureArrivalMinTripMinutes: 3
    });
    expect(upsertProfileMock).toHaveBeenCalledWith({
      allow_guardian_check_requests: false
    });
    expect(clearAutoCheckinConfigMock).toHaveBeenCalledTimes(1);
    expect(clearAutoCheckinDetectorStateMock).toHaveBeenCalledTimes(1);
    expect(logPrivacyEventMock).toHaveBeenCalledTimes(1);
  });
});
