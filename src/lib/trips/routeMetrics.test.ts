// Tests de métriques trajet:
// - estimation locale (distance + durée)
// - cas "aucun calcul possible"
// - fallback Google si configuré.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRoute } from "./routing";

type MockFetchResponse = {
  ok?: boolean;
  json: any;
};

function mockFetchSequence(responses: MockFetchResponse[]) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: response.ok ?? true,
      json: async () => response.json
    });
  }
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  return fetchMock;
}

function geocodeOk(lon: number, lat: number) {
  return { json: { features: [{ geometry: { coordinates: [lon, lat] } }] } };
}

function geocodeFailAll() {
  return [{ json: { features: [] } }, { json: { results: [] } }, { json: { results: [] } }];
}

const originalGoogleKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

describe("route metrics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  });

  afterAll(() => {
    if (originalGoogleKey === undefined) {
      delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    } else {
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = originalGoogleKey;
    }
  });

  it("calculates driving travel time and distance from local estimate", async () => {
    mockFetchSequence([geocodeOk(2.35, 48.86), geocodeOk(2.37, 48.88)]);

    const route = await fetchRoute("Paris A", "Paris B", "driving");

    expect(route?.provider).toBe("estimate");
    expect(route?.durationMinutes).toBeGreaterThan(0);
    expect(route?.distanceKm).toBeGreaterThan(0);
    expect(route?.coords.length).toBe(2);
  });

  it("returns null when no route can be computed between the 2 addresses (transit sans clé)", async () => {
    mockFetchSequence([...geocodeFailAll(), ...geocodeFailAll()]);

    const route = await fetchRoute("Adresse inconnue 1", "Adresse inconnue 2", "transit");

    expect(route).toBeNull();
  });

  it("uses Google metrics when API key is configured and estimate fails", async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = "test-key";
    mockFetchSequence([
      ...geocodeFailAll(),
      ...geocodeFailAll(),
      {
        json: {
          routes: [
            {
              legs: [{ duration: { value: 2700 }, distance: { value: 12345 } }],
              overview_polyline: { points: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" }
            }
          ]
        }
      }
    ]);

    const route = await fetchRoute("A", "B", "transit");

    expect(route?.provider).toBe("google");
    expect(route?.durationMinutes).toBe(45);
    expect(route?.distanceKm).toBe(12.3);
    expect(route?.coords.length).toBeGreaterThan(1);
  });
});
