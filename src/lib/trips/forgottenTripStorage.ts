// Persistance des réglages de trajet oublié + cache de géocodage côté client.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { geocodeAddress } from "./routing";
import type { FavoriteAddress } from "../core/db";
import {
  DEFAULT_FORGOTTEN_TRIP_CONFIG,
  inferPreferredPlaceType,
  isLikelyPreferredPlace,
  type ForgottenTripConfig,
  type PreferredPlace
} from "./forgottenTrip";

const CONFIG_KEY = "safeback:forgotten_trip_config";
const GEOCODE_CACHE_KEY = "safeback:forgotten_trip_geocode_cache";
const GEOCODE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

type GeocodeCache = Record<
  string,
  {
    latitude: number;
    longitude: number;
    updatedAt: number;
  }
>;

function normalizeConfig(value: Partial<ForgottenTripConfig> | null | undefined): ForgottenTripConfig {
  const base = value ?? {};
  return {
    enabled:
      typeof base.enabled === "boolean"
        ? base.enabled
        : DEFAULT_FORGOTTEN_TRIP_CONFIG.enabled,
    selectedFavoriteIds: Array.isArray(base.selectedFavoriteIds)
      ? base.selectedFavoriteIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : DEFAULT_FORGOTTEN_TRIP_CONFIG.selectedFavoriteIds,
    placeRadiusMeters: Math.max(
      40,
      Math.round(base.placeRadiusMeters ?? DEFAULT_FORGOTTEN_TRIP_CONFIG.placeRadiusMeters)
    ),
    departureDistanceMeters: Math.max(
      80,
      Math.round(base.departureDistanceMeters ?? DEFAULT_FORGOTTEN_TRIP_CONFIG.departureDistanceMeters)
    ),
    cooldownMinutes: Math.max(
      1,
      Math.round(base.cooldownMinutes ?? DEFAULT_FORGOTTEN_TRIP_CONFIG.cooldownMinutes)
    )
  };
}

async function getGeocodeCache(): Promise<GeocodeCache> {
  const raw = await AsyncStorage.getItem(GEOCODE_CACHE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as GeocodeCache;
    return parsed ?? {};
  } catch {
    return {};
  }
}

async function setGeocodeCache(cache: GeocodeCache): Promise<void> {
  await AsyncStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
}

export async function getForgottenTripConfig(): Promise<ForgottenTripConfig> {
  const raw = await AsyncStorage.getItem(CONFIG_KEY);
  if (!raw) return DEFAULT_FORGOTTEN_TRIP_CONFIG;
  try {
    return normalizeConfig(JSON.parse(raw) as Partial<ForgottenTripConfig>);
  } catch {
    return DEFAULT_FORGOTTEN_TRIP_CONFIG;
  }
}

export async function setForgottenTripConfig(config: ForgottenTripConfig): Promise<void> {
  const normalized = normalizeConfig(config);
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(normalized));
}

export async function resetForgottenTripConfig(): Promise<void> {
  await setForgottenTripConfig(DEFAULT_FORGOTTEN_TRIP_CONFIG);
}

function getDefaultSelectedFavoriteIds(favorites: FavoriteAddress[]): string[] {
  return favorites
    .filter((favorite) => isLikelyPreferredPlace(inferPreferredPlaceType(favorite.label ?? "")))
    .map((favorite) => favorite.id);
}

export async function resolvePreferredPlacesFromFavorites(params: {
  favorites: FavoriteAddress[];
  config: ForgottenTripConfig;
}): Promise<PreferredPlace[]> {
  const { favorites, config } = params;
  if (favorites.length === 0) return [];

  const selectedIds =
    config.selectedFavoriteIds.length > 0
      ? new Set(config.selectedFavoriteIds)
      : new Set(getDefaultSelectedFavoriteIds(favorites));

  const selectedFavorites = favorites.filter((favorite) => selectedIds.has(favorite.id));
  if (selectedFavorites.length === 0) return [];

  const now = Date.now();
  const cache = await getGeocodeCache();
  let cacheDirty = false;
  const places: PreferredPlace[] = [];

  for (const favorite of selectedFavorites) {
    const cacheEntry = cache[favorite.address];
    let latitude = cacheEntry?.latitude;
    let longitude = cacheEntry?.longitude;
    const cacheValid =
      typeof latitude === "number" &&
      typeof longitude === "number" &&
      typeof cacheEntry?.updatedAt === "number" &&
      now - cacheEntry.updatedAt < GEOCODE_TTL_MS;

    if (!cacheValid) {
      const geo = await geocodeAddress(favorite.address);
      if (!geo) continue;
      latitude = geo.lat;
      longitude = geo.lon;
      cache[favorite.address] = {
        latitude,
        longitude,
        updatedAt: now
      };
      cacheDirty = true;
    }

    if (typeof latitude !== "number" || typeof longitude !== "number") continue;

    places.push({
      id: favorite.id,
      label: favorite.label,
      address: favorite.address,
      latitude,
      longitude,
      type: inferPreferredPlaceType(favorite.label),
      radiusMeters: config.placeRadiusMeters
    });
  }

  if (cacheDirty) {
    await setGeocodeCache(cache);
  }

  return places;
}
