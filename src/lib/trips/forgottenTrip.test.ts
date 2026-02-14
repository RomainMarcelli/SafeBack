// Tests unitaires pour valider le comportement de `forgottenTrip` et prévenir les régressions.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORGOTTEN_TRIP_CONFIG,
  detectForgottenTrip,
  findCurrentPlace,
  inferPreferredPlaceType,
  type PreferredPlace
} from "./forgottenTrip";

const PLACES: PreferredPlace[] = [
  {
    id: "home",
    label: "Maison",
    address: "Paris",
    latitude: 48.8566,
    longitude: 2.3522,
    type: "home",
    radiusMeters: 150
  }
];

describe("forgottenTrip helpers", () => {
  it("infers common preferred place types from labels", () => {
    expect(inferPreferredPlaceType("Maison principale")).toBe("home");
    expect(inferPreferredPlaceType("Bureau centre")).toBe("work");
    expect(inferPreferredPlaceType("Chez amis")).toBe("friends");
    expect(inferPreferredPlaceType("Supermarche")).toBe("other");
  });

  it("finds current place when coordinates are inside radius", () => {
    const place = findCurrentPlace({
      coords: { latitude: 48.8567, longitude: 2.3522 },
      places: PLACES,
      defaultRadiusMeters: 120
    });
    expect(place?.id).toBe("home");
  });

  it("triggers notification when leaving a preferred place without active session", () => {
    const result = detectForgottenTrip({
      coords: { latitude: 48.8605, longitude: 2.3600 },
      places: PLACES,
      config: DEFAULT_FORGOTTEN_TRIP_CONFIG,
      state: { insidePlaceId: "home", lastAlertAtMs: null },
      hasActiveSession: false,
      nowMs: new Date("2026-02-12T12:00:00.000Z").getTime()
    });
    expect(result.shouldNotify).toBe(true);
    expect(result.placeLabel).toBe("Maison");
    expect(result.nextState.insidePlaceId).toBeNull();
  });

  it("does not trigger when an active session exists", () => {
    const result = detectForgottenTrip({
      coords: { latitude: 48.8605, longitude: 2.3600 },
      places: PLACES,
      config: DEFAULT_FORGOTTEN_TRIP_CONFIG,
      state: { insidePlaceId: "home", lastAlertAtMs: null },
      hasActiveSession: true
    });
    expect(result.shouldNotify).toBe(false);
  });
});
