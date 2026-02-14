// Tests unitaires pour valider le comportement de `autoCheckins` et prévenir les régressions.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTO_CHECKIN_DETECTOR_STATE,
  evaluateAutoCheckinArrivals,
  evaluateAutoCheckinRules,
  type AutoCheckinRule
} from "./autoCheckins";

function buildRule(partial?: Partial<AutoCheckinRule>): AutoCheckinRule {
  return {
    id: partial?.id ?? "rule-1",
    label: partial?.label ?? "Maison",
    address: partial?.address ?? "1 rue test",
    latitude: partial?.latitude ?? 49.4178,
    longitude: partial?.longitude ?? 2.8261,
    radiusMeters: partial?.radiusMeters ?? 120,
    cooldownMinutes: partial?.cooldownMinutes ?? 60,
    recipientUserIds: partial?.recipientUserIds ?? ["friend-1"],
    trigger: partial?.trigger ?? {
      byPosition: true,
      byHomeWifi: false,
      byCharging: false,
      homeWifiIpPrefix: null
    },
    enabled: partial?.enabled ?? true,
    createdAtIso: partial?.createdAtIso ?? "2026-02-14T10:00:00.000Z",
    updatedAtIso: partial?.updatedAtIso ?? "2026-02-14T10:00:00.000Z"
  };
}

describe("evaluateAutoCheckinArrivals", () => {
  it("déclenche quand on entre dans une zone depuis l'extérieur", () => {
    const rule = buildRule();
    const result = evaluateAutoCheckinArrivals({
      coords: { latitude: rule.latitude, longitude: rule.longitude },
      rules: [rule],
      state: DEFAULT_AUTO_CHECKIN_DETECTOR_STATE,
      nowMs: 1000
    });

    expect(result.triggeredRules.map((item) => item.id)).toEqual([rule.id]);
    expect(result.nextState.insideRuleIds).toContain(rule.id);
    expect(result.nextState.lastSentAtMsByRule[rule.id]).toBe(1000);
  });

  it("ne redéclenche pas tant qu'on reste dans la zone", () => {
    const rule = buildRule();
    const first = evaluateAutoCheckinArrivals({
      coords: { latitude: rule.latitude, longitude: rule.longitude },
      rules: [rule],
      state: DEFAULT_AUTO_CHECKIN_DETECTOR_STATE,
      nowMs: 1000
    });
    const second = evaluateAutoCheckinArrivals({
      coords: { latitude: rule.latitude, longitude: rule.longitude },
      rules: [rule],
      state: first.nextState,
      nowMs: 2000
    });
    expect(second.triggeredRules).toHaveLength(0);
  });

  it("redéclenche après sortie puis nouvelle entrée, en respectant le cooldown", () => {
    const rule = buildRule({ cooldownMinutes: 10 });
    const enter1 = evaluateAutoCheckinArrivals({
      coords: { latitude: rule.latitude, longitude: rule.longitude },
      rules: [rule],
      state: DEFAULT_AUTO_CHECKIN_DETECTOR_STATE,
      nowMs: 1000
    });
    const exit = evaluateAutoCheckinArrivals({
      coords: { latitude: rule.latitude + 0.01, longitude: rule.longitude + 0.01 },
      rules: [rule],
      state: enter1.nextState,
      nowMs: 2000
    });
    const reenterTooSoon = evaluateAutoCheckinArrivals({
      coords: { latitude: rule.latitude, longitude: rule.longitude },
      rules: [rule],
      state: exit.nextState,
      nowMs: 1000 + 5 * 60_000
    });
    expect(reenterTooSoon.triggeredRules).toHaveLength(0);

    const exitAgain = evaluateAutoCheckinArrivals({
      coords: { latitude: rule.latitude + 0.01, longitude: rule.longitude + 0.01 },
      rules: [rule],
      state: reenterTooSoon.nextState,
      nowMs: 1000 + 6 * 60_000
    });
    const reenterAfterCooldown = evaluateAutoCheckinArrivals({
      coords: { latitude: rule.latitude, longitude: rule.longitude },
      rules: [rule],
      state: exitAgain.nextState,
      nowMs: 1000 + 11 * 60_000
    });
    expect(reenterAfterCooldown.triggeredRules.map((item) => item.id)).toEqual([rule.id]);
  });

  it("ignore une règle désactivée ou sans destinataire", () => {
    const enabledNoRecipient = buildRule({ id: "rule-no-recipient", recipientUserIds: [] });
    const disabled = buildRule({ id: "rule-disabled", enabled: false });
    const result = evaluateAutoCheckinArrivals({
      coords: { latitude: enabledNoRecipient.latitude, longitude: enabledNoRecipient.longitude },
      rules: [enabledNoRecipient, disabled],
      state: DEFAULT_AUTO_CHECKIN_DETECTOR_STATE,
      nowMs: 1000
    });
    expect(result.triggeredRules).toHaveLength(0);
  });
});

describe("evaluateAutoCheckinRules", () => {
  it("déclenche avec matching SSID natif quand configuré", () => {
    const rule = buildRule({
      trigger: {
        byPosition: false,
        byHomeWifi: true,
        byCharging: false,
        homeWifiSsid: "Maison-5G",
        homeWifiBssid: null,
        homeWifiIpPrefix: null
      }
    });
    const result = evaluateAutoCheckinRules({
      rules: [rule],
      state: DEFAULT_AUTO_CHECKIN_DETECTOR_STATE,
      context: {
        isOnWifi: true,
        wifiSsid: "Maison-5G",
        wifiIpAddress: "192.168.1.4"
      },
      nowMs: 1000
    });
    expect(result.triggeredRules.map((item) => item.id)).toEqual([rule.id]);
  });

  it("déclenche quand toutes les conditions sélectionnées sont validées", () => {
    const rule = buildRule({
      trigger: {
        byPosition: true,
        byHomeWifi: true,
        byCharging: true,
        homeWifiIpPrefix: "192.168.1"
      }
    });
    const result = evaluateAutoCheckinRules({
      rules: [rule],
      state: DEFAULT_AUTO_CHECKIN_DETECTOR_STATE,
      context: {
        coords: { latitude: rule.latitude, longitude: rule.longitude },
        isOnWifi: true,
        wifiIpAddress: "192.168.1.37",
        isCharging: true
      },
      nowMs: 1000
    });
    expect(result.triggeredRules.map((item) => item.id)).toEqual([rule.id]);
  });

  it("ne déclenche pas si une condition active manque", () => {
    const rule = buildRule({
      trigger: {
        byPosition: false,
        byHomeWifi: true,
        byCharging: true,
        homeWifiIpPrefix: "192.168.1"
      }
    });
    const result = evaluateAutoCheckinRules({
      rules: [rule],
      state: DEFAULT_AUTO_CHECKIN_DETECTOR_STATE,
      context: {
        isOnWifi: true,
        wifiIpAddress: "192.168.1.55",
        isCharging: false
      },
      nowMs: 1000
    });
    expect(result.triggeredRules).toHaveLength(0);
  });
});
