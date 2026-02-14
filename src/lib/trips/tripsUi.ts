// Helpers UI de la page trajets pour clarifier la lecture et simplifier les tests.
import type { SecurityTimelineEvent } from "../social/messagingDb";

export type TripSessionLite = {
  from_address?: string | null;
  to_address?: string | null;
};

export function filterTripSessionsByQuery<T extends TripSessionLite>(sessions: T[], query: string): T[] {
  const value = query.trim().toLowerCase();
  if (!value) return sessions;
  return sessions.filter((session) => {
    const from = String(session.from_address ?? "").toLowerCase();
    const to = String(session.to_address ?? "").toLowerCase();
    return from.includes(value) || to.includes(value);
  });
}

export function getTimelineBadge(type: SecurityTimelineEvent["type"]): {
  badge: string;
  badgeClass: string;
} {
  if (type === "sos") {
    return {
      badge: "SOS",
      badgeClass: "bg-rose-100 text-rose-700"
    };
  }
  if (type === "arrival_confirmation") {
    return {
      badge: "Arrivée",
      badgeClass: "bg-emerald-100 text-emerald-700"
    };
  }
  if (type === "delay_check") {
    return {
      badge: "Retard",
      badgeClass: "bg-amber-100 text-amber-700"
    };
  }
  if (type === "low_battery") {
    return {
      badge: "Batterie",
      badgeClass: "bg-fuchsia-100 text-fuchsia-700"
    };
  }
  if (type === "auto_checkin") {
    return {
      badge: "Auto",
      badgeClass: "bg-emerald-100 text-emerald-700"
    };
  }
  return {
    badge: "Trajet",
    badgeClass: "bg-sky-100 text-sky-700"
  };
}

