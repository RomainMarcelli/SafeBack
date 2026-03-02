// Tests unitaires pour valider le comportement de `sos` et prévenir les régressions.
import { describe, expect, it } from "vitest";
import { buildSmsUrl, buildSosMessage, formatSosCoords } from "./sos";

describe("sos helpers", () => {
  it("formats coordinates safely", () => {
    expect(formatSosCoords({ lat: 48.85661, lon: 2.35222 })).toBe("48.85661, 2.35222");
    expect(formatSosCoords(null)).toBe("position inconnue");
  });

  it("builds SOS message with current address and maps link", () => {
    const message = buildSosMessage({
      fromAddress: "Paris",
      toAddress: "Lyon",
      currentAddress: "10 Rue de la Paix, Paris",
      coords: { lat: 48.8566, lon: 2.3522 },
      now: new Date("2026-02-12T10:30:00.000Z")
    });

    expect(message).toContain("Je suis en danger.");
    expect(message).toContain("Je suis ici : 10 Rue de la Paix, Paris.");
    expect(message).toContain("https://maps.google.com/?q=48.8566,2.3522");
  });

  it("builds platform-specific sms url", () => {
    const ios = buildSmsUrl({
      phones: ["+33600000000", "0600000001"],
      body: "SOS",
      platform: "ios"
    });
    const android = buildSmsUrl({
      phones: ["+33600000000"],
      body: "SOS",
      platform: "android"
    });

    expect(ios).toContain("sms:+33600000000,0600000001&body=");
    expect(android).toContain("sms:+33600000000?body=");
  });

  it("returns null sms url when no recipient", () => {
    expect(buildSmsUrl({ phones: [], body: "SOS", platform: "android" })).toBeNull();
  });
});
