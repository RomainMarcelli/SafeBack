export type NotifyMode = "app" | "sms" | "email" | "whatsapp" | "auto";

export type NotifyContact = {
  id: string;
  name: string;
  channel: "sms" | "whatsapp" | "call";
  phone?: string | null;
  email?: string | null;
};

export type NotificationDispatchPlan = {
  mode: NotifyMode;
  smsUrl: string | null;
  mailUrl: string | null;
  whatsappUrl: string | null;
  needsInAppAlert: boolean;
  issues: string[];
};

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((item) => item.trim().length > 0).map((item) => item.trim()))];
}

function buildSmsUrl(phones: string[], body: string, platform: "ios" | "android"): string | null {
  const cleanPhones = unique(phones.map(normalizePhone)).filter((value) => value.length > 0);
  if (cleanPhones.length === 0) return null;
  const separator = platform === "ios" ? "&" : "?";
  return `sms:${cleanPhones.join(",")}${separator}body=${encodeURIComponent(body)}`;
}

function buildMailUrl(emails: string[], subject: string, body: string): string | null {
  const recipients = unique(emails).filter((value) => value.includes("@"));
  if (recipients.length === 0) return null;
  return `mailto:${recipients.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildWhatsAppUrl(phone: string, body: string): string {
  const clean = normalizePhone(phone).replace(/^\+/, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(body)}`;
}

export function createNotificationDispatchPlan(params: {
  mode: NotifyMode;
  contacts: NotifyContact[];
  subject: string;
  body: string;
  platform: "ios" | "android";
}): NotificationDispatchPlan {
  const { mode, contacts, subject, body, platform } = params;
  const issues: string[] = [];
  const smsPhones = contacts.map((contact) => contact.phone ?? "").filter(Boolean);
  const emails = contacts.map((contact) => contact.email ?? "").filter(Boolean);
  const whatsappContact = contacts.find(
    (contact) => contact.channel === "whatsapp" && String(contact.phone ?? "").trim().length > 0
  );

  const autoSmsPhones = contacts
    .filter((contact) => contact.channel === "sms")
    .map((contact) => contact.phone ?? "")
    .filter(Boolean);
  const autoWhatsAppContact = contacts.find(
    (contact) => contact.channel === "whatsapp" && String(contact.phone ?? "").trim().length > 0
  );

  let smsUrl: string | null = null;
  let mailUrl: string | null = null;
  let whatsappUrl: string | null = null;
  let needsInAppAlert = mode === "app";

  if (mode === "sms") {
    smsUrl = buildSmsUrl(smsPhones, body, platform);
    if (!smsUrl) issues.push("Aucun numero de telephone disponible pour un envoi SMS.");
  } else if (mode === "email") {
    mailUrl = buildMailUrl(emails, subject, body);
    if (!mailUrl) issues.push("Aucune adresse email disponible pour un envoi mail.");
  } else if (mode === "whatsapp") {
    if (!whatsappContact?.phone) {
      issues.push("Aucun contact WhatsApp avec numero valide.");
    } else {
      whatsappUrl = buildWhatsAppUrl(whatsappContact.phone, body);
    }
  } else if (mode === "auto") {
    smsUrl = buildSmsUrl(autoSmsPhones, body, platform);
    if (!smsUrl) issues.push("Aucun contact SMS disponible en mode auto.");
    if (autoWhatsAppContact?.phone) {
      whatsappUrl = buildWhatsAppUrl(autoWhatsAppContact.phone, body);
    }
    needsInAppAlert = true;
  }

  return {
    mode,
    smsUrl,
    mailUrl,
    whatsappUrl,
    needsInAppAlert,
    issues
  };
}

