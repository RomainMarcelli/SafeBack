const GEO_SEARCH_API = "https://data.geopf.fr/geocodage/search";
const GEO_COMPLETION_API = "https://data.geopf.fr/geocodage/completion";
const OSRM_ROUTE_API = "https://router.project-osrm.org/route/v1";

export type RouteMode = "walking" | "driving" | "transit";

export type RouteResult = {
  coords: { latitude: number; longitude: number }[];
  durationMinutes: number;
  distanceKm: number;
  provider: "osrm" | "google" | "estimate";
};

export async function geocodeAddress(address: string) {
  // Cette fonction tolère plusieurs formats de réponse API pour rester robuste selon le provider.
  const fetchCoords = async (url: string, params: URLSearchParams) => {
    const response = await fetch(`${url}?${params.toString()}`);
    const json = await response.json();
    const feature = json?.features?.[0];
    const [lon, lat] = feature?.geometry?.coordinates ?? [];
    if (typeof lon === "number" && typeof lat === "number") {
      return { lon, lat };
    }
    const result = json?.results?.[0];
    const lonAlt = result?.x ?? result?.lon ?? result?.geometry?.coordinates?.[0];
    const latAlt = result?.y ?? result?.lat ?? result?.geometry?.coordinates?.[1];
    if (typeof lonAlt === "number" && typeof latAlt === "number") {
      return { lon: lonAlt, lat: latAlt };
    }
    return null;
  };

  const paramsText = new URLSearchParams({ text: address, limit: "1" });
  const paramsQ = new URLSearchParams({ q: address, limit: "1" });
  const paramsCompletion = new URLSearchParams({
    text: address,
    type: "StreetAddress",
    maximumResponses: "1"
  });

  return (
    (await fetchCoords(GEO_SEARCH_API, paramsText)) ??
    (await fetchCoords(GEO_SEARCH_API, paramsQ)) ??
    (await fetchCoords(GEO_COMPLETION_API, paramsCompletion))
  );
}

function decodePolyline(encoded: string) {
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const coordinates: { latitude: number; longitude: number }[] = [];

  while (index < len) {
    let b = 0;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return coordinates;
}

async function fetchOsrmRoute(from: string, to: string, profile: "foot" | "driving") {
  const fromCoords = await geocodeAddress(from);
  const toCoords = await geocodeAddress(to);
  if (!fromCoords || !toCoords) {
    console.log("[routing] Geocode KO", { fromCoords, toCoords, from, to });
    return null;
  }

  const response = await fetch(
    `${OSRM_ROUTE_API}/${profile}/${fromCoords.lon},${fromCoords.lat};${toCoords.lon},${toCoords.lat}?overview=full&geometries=geojson`
  );
  if (!response.ok) {
    console.log("[routing] OSRM response not ok", { status: response.status, profile });
    return null;
  }
  const json = await response.json();
  if (json?.code && json.code !== "Ok") {
    console.log("[routing] OSRM error", { code: json.code, profile });
    return null;
  }
  const route = json?.routes?.[0];
  if (!route?.geometry?.coordinates) return null;

  const coords = route.geometry.coordinates.map((pair: number[]) => ({
    latitude: pair[1],
    longitude: pair[0]
  }));

  return {
    coords,
    durationMinutes: Math.round(route.duration / 60),
    distanceKm: Math.round((route.distance / 1000) * 10) / 10,
    provider: "osrm" as const
  };
}

async function fetchGoogleRoute(from: string, to: string, apiKey: string, mode: RouteMode) {
  const params = new URLSearchParams({
    origin: from,
    destination: to,
    mode,
    key: apiKey
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
  const json = await response.json();
  const route = json?.routes?.[0];
  const leg = route?.legs?.[0];
  const polyline = route?.overview_polyline?.points;
  if (!leg || !polyline) return null;

  return {
    coords: decodePolyline(polyline),
    durationMinutes: Math.round(leg.duration.value / 60),
    distanceKm: Math.round((leg.distance.value / 1000) * 10) / 10,
    provider: "google" as const
  };
}

function haversineDistanceKm(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lon - from.lon);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

async function estimateRouteByDistance(from: string, to: string, mode: RouteMode): Promise<RouteResult | null> {
  const [fromCoords, toCoords] = await Promise.all([geocodeAddress(from), geocodeAddress(to)]);
  if (!fromCoords || !toCoords) return null;

  // Estimation simple et robuste: distance à vol d'oiseau + coefficient réaliste selon le mode.
  const directDistance = haversineDistanceKm(
    { lat: fromCoords.lat, lon: fromCoords.lon },
    { lat: toCoords.lat, lon: toCoords.lon }
  );
  const distanceFactorByMode: Record<RouteMode, number> = {
    walking: 1.28,
    driving: 1.35,
    transit: 1.42
  };
  const speedKmHByMode: Record<RouteMode, number> = {
    walking: 4.8,
    driving: 32,
    transit: 20
  };

  const networkDistanceKm = Math.max(0.2, directDistance * distanceFactorByMode[mode]);
  const durationMinutes = Math.max(1, Math.round((networkDistanceKm / speedKmHByMode[mode]) * 60));

  return {
    coords: [
      { latitude: fromCoords.lat, longitude: fromCoords.lon },
      { latitude: toCoords.lat, longitude: toCoords.lon }
    ],
    durationMinutes,
    distanceKm: Math.round(networkDistanceKm * 10) / 10,
    provider: "estimate"
  };
}

export async function fetchRoute(from: string, to: string, mode: RouteMode): Promise<RouteResult | null> {
  if (!from.trim() || !to.trim()) return null;
  // Nouveau mode de calcul: estimation stable basée sur géocodage + distance haversine.
  // Objectif: éviter la fragilité des providers de routing externes sur mobile/dev.
  const estimated = await estimateRouteByDistance(from, to, mode);
  if (estimated) return estimated;

  // Fallback final: conserve l'ancien comportement si l'estimation échoue.
  if (mode === "walking") {
    const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (key) {
      const google = await fetchGoogleRoute(from, to, key, "walking");
      if (google) return google;
    }
    return fetchOsrmRoute(from, to, "foot");
  }
  if (mode === "driving") {
    const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (key) {
      const google = await fetchGoogleRoute(from, to, key, "driving");
      if (google) return google;
    }
    return fetchOsrmRoute(from, to, "driving");
  }
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  return fetchGoogleRoute(from, to, key, "transit");
}
