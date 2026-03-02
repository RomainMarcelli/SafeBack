// Tests unitaires du module de routing:
// - géocodage avec fallbacks
// - estimation locale du trajet
// - fallback provider (Google) si le géocodage échoue.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRoute, geocodeAddress } from "./routing";

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

describe("routing", () => {
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

  it("geocodeAddress falls back from text to q", async () => {
    const fetchMock = mockFetchSequence([
      { json: { features: [] } },
      { json: { results: [{ lon: 2.35, lat: 48.86 }] } }
    ]);

    const result = await geocodeAddress("Paris");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ lon: 2.35, lat: 48.86 });
  });

  it("geocodeAddress falls back to completion endpoint", async () => {
    const fetchMock = mockFetchSequence([
      { json: { features: [] } },
      { json: { results: [] } },
      { json: { results: [{ x: 2.31, y: 48.83 }] } }
    ]);

    const result = await geocodeAddress("Address");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ lon: 2.31, lat: 48.83 });
  });

  it("fetchRoute returns local estimate for walking", async () => {
    const fetchMock = mockFetchSequence([geocodeOk(2.35, 48.86), geocodeOk(2.36, 48.87)]);

    const route = await fetchRoute("A", "B", "walking");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(route?.provider).toBe("estimate");
    expect(route?.distanceKm).toBe(1.7);
    expect(route?.durationMinutes).toBe(21);
    expect(route?.coords.length).toBe(2);
  });

  it("fetchRoute returns local estimate for driving", async () => {
    const fetchMock = mockFetchSequence([geocodeOk(2.35, 48.86), geocodeOk(2.36, 48.87)]);

    const route = await fetchRoute("A", "B", "driving");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(route?.provider).toBe("estimate");
    expect(route?.distanceKm).toBe(1.8);
    expect(route?.durationMinutes).toBe(3);
  });

  it("fetchRoute returns local estimate for transit even without Google key", async () => {
    const fetchMock = mockFetchSequence([geocodeOk(2.35, 48.86), geocodeOk(2.36, 48.87)]);

    const route = await fetchRoute("A", "B", "transit");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(route?.provider).toBe("estimate");
    expect(route?.distanceKm).toBe(1.9);
    expect(route?.durationMinutes).toBe(6);
  });

  it("fetchRoute uses Google fallback when estimate cannot geocode addresses", async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = "test-key";
    const fetchMock = mockFetchSequence([
      ...geocodeFailAll(),
      ...geocodeFailAll(),
      {
        json: {
          routes: [
            {
              legs: [{ duration: { value: 1800 }, distance: { value: 5000 } }],
              overview_polyline: { points: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" }
            }
          ]
        }
      }
    ]);

    const route = await fetchRoute("A", "B", "driving");

    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(route?.provider).toBe("google");
    expect(route?.distanceKm).toBe(5);
    expect(route?.durationMinutes).toBe(30);
    expect(route?.coords.length).toBeGreaterThan(1);
  });

  it("fetchRoute returns null when addresses are blank", async () => {
    vi.stubGlobal("fetch", vi.fn() as unknown as typeof fetch);
    await expect(fetchRoute(" ", "B", "walking")).resolves.toBeNull();
    await expect(fetchRoute("A", "   ", "driving")).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
