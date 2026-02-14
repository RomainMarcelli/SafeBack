export type PreferredPlaceType = "home" | "work" | "friends" | "other";

export type PreferredPlace = {
  id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  type: PreferredPlaceType;
  radiusMeters?: number;
};

export type ForgottenTripConfig = {
  enabled: boolean;
  selectedFavoriteIds: string[];
  placeRadiusMeters: number;
  departureDistanceMeters: number;
  cooldownMinutes: number;
};

export type ForgottenTripDetectionState = {
  insidePlaceId: string | null;
  lastAlertAtMs: number | null;
};

export type ForgottenTripDetectionResult = {
  nextState: ForgottenTripDetectionState;
  shouldNotify: boolean;
  placeLabel: string | null;
};

export const DEFAULT_FORGOTTEN_TRIP_CONFIG: ForgottenTripConfig = {
  enabled: true,
  selectedFavoriteIds: [],
  placeRadiusMeters: 140,
  departureDistanceMeters: 260,
  cooldownMinutes: 30
};

const HOME_KEYWORDS = ["maison", "home", "domicile", "chez moi"];
const WORK_KEYWORDS = ["travail", "bureau", "work", "office"];
const FRIENDS_KEYWORDS = ["ami", "amis", "friend", "friends", "famille"];

export function inferPreferredPlaceType(label: string): PreferredPlaceType {
  const value = label.toLowerCase().trim();
  if (HOME_KEYWORDS.some((keyword) => value.includes(keyword))) return "home";
  if (WORK_KEYWORDS.some((keyword) => value.includes(keyword))) return "work";
  if (FRIENDS_KEYWORDS.some((keyword) => value.includes(keyword))) return "friends";
  return "other";
}

export function isLikelyPreferredPlace(type: PreferredPlaceType): boolean {
  return type === "home" || type === "work" || type === "friends";
}

export function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number {
  // Formule de Haversine pour une distance géodésique approximative en mètres.
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

export function findCurrentPlace(params: {
  coords: { latitude: number; longitude: number };
  places: PreferredPlace[];
  defaultRadiusMeters: number;
}): PreferredPlace | null {
  const { coords, places, defaultRadiusMeters } = params;
  let best: { place: PreferredPlace; distance: number } | null = null;

  // Choisit le lieu incluant la position actuelle avec la plus petite distance au centre.
  for (const place of places) {
    const radius = Math.max(30, Math.round(place.radiusMeters ?? defaultRadiusMeters));
    const dist = distanceMeters(coords, {
      latitude: place.latitude,
      longitude: place.longitude
    });
    if (dist <= radius) {
      if (!best || dist < best.distance) {
        best = { place, distance: dist };
      }
    }
  }

  return best?.place ?? null;
}

export function detectForgottenTrip(params: {
  coords: { latitude: number; longitude: number };
  places: PreferredPlace[];
  config: ForgottenTripConfig;
  state: ForgottenTripDetectionState;
  hasActiveSession: boolean;
  nowMs?: number;
}): ForgottenTripDetectionResult {
  const nowMs = params.nowMs ?? Date.now();
  const currentPlace = findCurrentPlace({
    coords: params.coords,
    places: params.places,
    defaultRadiusMeters: params.config.placeRadiusMeters
  });

  if (params.hasActiveSession) {
    return {
      shouldNotify: false,
      placeLabel: null,
      nextState: {
        insidePlaceId: currentPlace?.id ?? null,
        lastAlertAtMs: params.state.lastAlertAtMs
      }
    };
  }

  if (currentPlace) {
    return {
      shouldNotify: false,
      placeLabel: null,
      nextState: {
        insidePlaceId: currentPlace.id,
        lastAlertAtMs: params.state.lastAlertAtMs
      }
    };
  }

  const previousInsideId = params.state.insidePlaceId;
  if (!previousInsideId) {
    return {
      shouldNotify: false,
      placeLabel: null,
      nextState: params.state
    };
  }

  const previousPlace = params.places.find((place) => place.id === previousInsideId);
  const minDistance = Math.max(
    params.config.departureDistanceMeters,
    Math.round((previousPlace?.radiusMeters ?? params.config.placeRadiusMeters) * 1.2)
  );
  const currentDistance = previousPlace
    ? distanceMeters(params.coords, {
        latitude: previousPlace.latitude,
        longitude: previousPlace.longitude
      })
    : Infinity;
  const hasLeftEnough = !previousPlace || currentDistance >= minDistance;
  const cooldownMs = Math.max(1, params.config.cooldownMinutes) * 60_000;
  const cooldownPassed =
    !params.state.lastAlertAtMs || nowMs - params.state.lastAlertAtMs >= cooldownMs;

  // L'alerte ne part que si l'utilisateur a réellement quitté la zone et hors cooldown.
  if (hasLeftEnough && cooldownPassed) {
    return {
      shouldNotify: true,
      placeLabel: previousPlace?.label ?? "un lieu favori",
      nextState: {
        insidePlaceId: null,
        lastAlertAtMs: nowMs
      }
    };
  }

  return {
    shouldNotify: false,
    placeLabel: null,
    nextState: {
      insidePlaceId: null,
      lastAlertAtMs: params.state.lastAlertAtMs
    }
  };
}
