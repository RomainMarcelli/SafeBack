// Tests unitaires pour valider le comportement de `safetyEscalation.storage` et prévenir les régressions.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const memory = new Map<string, string>();
  return {
    memory,
    asyncStorage: {
      getItem: vi.fn(async (key: string) => memory.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        memory.set(key, value);
      })
    }
  };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: mocks.asyncStorage
}));

import {
  DEFAULT_SAFETY_ESCALATION_CONFIG,
  getSafetyEscalationConfig,
  resetSafetyEscalationConfig,
  setSafetyEscalationConfig
} from "./safetyEscalation";

describe("safetyEscalation storage", () => {
  beforeEach(() => {
    mocks.memory.clear();
    vi.clearAllMocks();
  });

  it("returns default config when nothing is stored", async () => {
    await expect(getSafetyEscalationConfig()).resolves.toEqual(DEFAULT_SAFETY_ESCALATION_CONFIG);
  });

  it("normalizes invalid values and keeps close delay >= reminder delay", async () => {
    await setSafetyEscalationConfig({
      enabled: true,
      reminderDelayMinutes: 90,
      closeContactsDelayMinutes: 30
    });

    await expect(getSafetyEscalationConfig()).resolves.toEqual({
      enabled: true,
      reminderDelayMinutes: 90,
      closeContactsDelayMinutes: 90
    });
  });

  it("restores default config on reset", async () => {
    await setSafetyEscalationConfig({
      enabled: false,
      reminderDelayMinutes: 60,
      closeContactsDelayMinutes: 180
    });
    await resetSafetyEscalationConfig();

    await expect(getSafetyEscalationConfig()).resolves.toEqual(DEFAULT_SAFETY_ESCALATION_CONFIG);
  });

  it("reads disabled flag and falls back to defaults for invalid minutes", async () => {
    await mocks.asyncStorage.setItem("safeback:safety_escalation_enabled", "false");
    await mocks.asyncStorage.setItem("safeback:safety_escalation_reminder_minutes", "invalid");
    await mocks.asyncStorage.setItem("safeback:safety_escalation_close_contacts_minutes", "-20");

    await expect(getSafetyEscalationConfig()).resolves.toEqual({
      enabled: false,
      reminderDelayMinutes: DEFAULT_SAFETY_ESCALATION_CONFIG.reminderDelayMinutes,
      closeContactsDelayMinutes: DEFAULT_SAFETY_ESCALATION_CONFIG.closeContactsDelayMinutes
    });
  });

  it("normalizes minutes before persisting", async () => {
    await setSafetyEscalationConfig({
      enabled: true,
      reminderDelayMinutes: -2,
      closeContactsDelayMinutes: 0
    });

    expect(mocks.asyncStorage.setItem).toHaveBeenCalledWith("safeback:safety_escalation_enabled", "true");
    expect(mocks.asyncStorage.setItem).toHaveBeenCalledWith("safeback:safety_escalation_reminder_minutes", "1");
    expect(mocks.asyncStorage.setItem).toHaveBeenCalledWith(
      "safeback:safety_escalation_close_contacts_minutes",
      "1"
    );
  });
});
