// Tests unitaires pour valider le comportement de `notifyChannels` et prévenir les régressions.
import { describe, expect, it } from "vitest";
import { createNotificationDispatchPlan } from "./notifyChannels";

const CONTACTS = [
  { id: "1", name: "A", channel: "sms" as const, phone: "+33600000000", email: "a@test.com" },
  { id: "2", name: "B", channel: "whatsapp" as const, phone: "+33611111111", email: "" }
];

describe("notifyChannels", () => {
  it("builds SMS dispatch plan", () => {
    const plan = createNotificationDispatchPlan({
      mode: "sms",
      contacts: CONTACTS,
      subject: "Sujet",
      body: "Hello",
      platform: "android"
    });
    expect(plan.smsUrl).toContain("sms:+33600000000,+33611111111?body=");
    expect(plan.issues).toHaveLength(0);
  });

  it("builds email dispatch plan", () => {
    const plan = createNotificationDispatchPlan({
      mode: "email",
      contacts: CONTACTS,
      subject: "Sujet",
      body: "Hello",
      platform: "ios"
    });
    expect(plan.mailUrl).toContain("mailto:a@test.com?");
    expect(plan.issues).toHaveLength(0);
  });

  it("builds whatsapp dispatch plan with whatsapp contact", () => {
    const plan = createNotificationDispatchPlan({
      mode: "whatsapp",
      contacts: CONTACTS,
      subject: "Sujet",
      body: "Hello",
      platform: "android"
    });
    expect(plan.whatsappUrl).toContain("https://wa.me/33611111111?text=");
  });

  it("auto mode combines app + sms + whatsapp", () => {
    const plan = createNotificationDispatchPlan({
      mode: "auto",
      contacts: CONTACTS,
      subject: "Sujet",
      body: "Hello",
      platform: "android"
    });
    expect(plan.needsInAppAlert).toBe(true);
    expect(plan.smsUrl).toContain("sms:+33600000000?body=");
    expect(plan.whatsappUrl).toContain("wa.me/33611111111");
  });

  it("returns issues when recipients are missing", () => {
    const plan = createNotificationDispatchPlan({
      mode: "email",
      contacts: [{ id: "1", name: "A", channel: "sms", phone: "0600000000", email: "" }],
      subject: "Sujet",
      body: "Hello",
      platform: "ios"
    });
    expect(plan.mailUrl).toBeNull();
    expect(plan.issues[0]).toContain("Aucune adresse email");
  });
});
