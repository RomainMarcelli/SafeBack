// Tests unitaires pour valider le comportement de `tripsUi` et prévenir les régressions.
import { describe, expect, it } from "vitest";
import { filterTripSessionsByQuery, getTimelineBadge } from "./tripsUi";

describe("tripsUi", () => {
  it("filtre les trajets sur départ et arrivée", () => {
    const sessions = [
      { from_address: "Compiègne", to_address: "Paris" },
      { from_address: "Lille", to_address: "Roubaix" }
    ];
    expect(filterTripSessionsByQuery(sessions, "paris")).toHaveLength(1);
    expect(filterTripSessionsByQuery(sessions, "lille")).toHaveLength(1);
    expect(filterTripSessionsByQuery(sessions, "")).toHaveLength(2);
  });

  it("retourne un badge explicite pour les événements clés", () => {
    expect(getTimelineBadge("arrival_confirmation").badge).toBe("Arrivée");
    expect(getTimelineBadge("delay_check").badge).toBe("Retard");
    expect(getTimelineBadge("auto_checkin").badge).toBe("Auto");
  });
});

