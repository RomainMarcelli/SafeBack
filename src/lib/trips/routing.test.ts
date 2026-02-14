// Tests unitaires pour valider le comportement de `routing` et prévenir les régressions.
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

  it("fetchRoute uses google directions when API key is present", async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = "test-key";
    const fetchMock = mockFetchSequence([
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

    const route = await fetchRoute("A", "B", "walking");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(route?.provider).toBe("google");
    expect(route?.durationMinutes).toBe(30);
    expect(route?.distanceKm).toBe(5);
    expect(route?.coords.length).toBeGreaterThan(1);
  });

  it("fetchRoute transit returns null when Google key is missing", async () => {
    vi.stubGlobal("fetch", vi.fn() as unknown as typeof fetch);
    const route = await fetchRoute("A", "B", "transit");
    expect(route).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetchRoute returns null when addresses are blank", async () => {
    vi.stubGlobal("fetch", vi.fn() as unknown as typeof fetch);
    await expect(fetchRoute(" ", "B", "walking")).resolves.toBeNull();
    await expect(fetchRoute("A", "   ", "driving")).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetchRoute walking adjusts OSRM duration when too optimistic", async () => {
    const fetchMock = mockFetchSequence([
      { json: { features: [{ geometry: { coordinates: [2.35, 48.86] } }] } },
      { json: { features: [{ geometry: { coordinates: [2.4, 48.9] } }] } },
      {
        json: {
          code: "Ok",
          routes: [
            {
              geometry: { coordinates: [[2.35, 48.86], [2.4, 48.9]] },
              duration: 600,
              distance: 10000
            }
          ]
        }
      }
    ]);

    const route = await fetchRoute("A", "B", "walking");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(route?.provider).toBe("osrm");
    expect(route?.distanceKm).toBe(10);
    expect(route?.durationMinutes).toBe(120);
  });

  it("fetchRoute walking falls back to driving profile and inflates duration", async () => {
    const fetchMock = mockFetchSequence([
      { json: { features: [{ geometry: { coordinates: [2.35, 48.86] } }] } },
      { json: { features: [{ geometry: { coordinates: [2.36, 48.87] } }] } },
      {
        json: {
          code: "NoRoute",
          routes: []
        }
      },
      { json: { features: [{ geometry: { coordinates: [2.35, 48.86] } }] } },
      { json: { features: [{ geometry: { coordinates: [2.36, 48.87] } }] } },
      {
        json: {
          code: "Ok",
          routes: [
            {
              geometry: { coordinates: [[2.35, 48.86], [2.36, 48.87]] },
              duration: 900,
              distance: 1000
            }
          ]
        }
      }
    ]);

    const route = await fetchRoute("A", "B", "walking");

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(route?.provider).toBe("osrm");
    expect(route?.durationMinutes).toBe(24);
  });

  it("fetchRoute driving uses google provider when key exists", async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = "test-key";
    const fetchMock = mockFetchSequence([
      {
        json: {
          routes: [
            {
              legs: [{ duration: { value: 1200 }, distance: { value: 3000 } }],
              overview_polyline: { points: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" }
            }
          ]
        }
      }
    ]);

    const route = await fetchRoute("A", "B", "driving");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(route?.provider).toBe("google");
    expect(route?.durationMinutes).toBe(20);
  });

  it("fetchRoute driving uses OSRM when key is missing", async () => {
    const fetchMock = mockFetchSequence([
      { json: { features: [{ geometry: { coordinates: [2.35, 48.86] } }] } },
      { json: { features: [{ geometry: { coordinates: [2.36, 48.87] } }] } },
      {
        json: {
          code: "Ok",
          routes: [
            {
              geometry: { coordinates: [[2.35, 48.86], [2.36, 48.87]] },
              duration: 600,
              distance: 4000
            }
          ]
        }
      }
    ]);

    const route = await fetchRoute("A", "B", "driving");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(route?.provider).toBe("osrm");
    expect(route?.durationMinutes).toBe(10);
    expect(route?.distanceKm).toBe(4);
  });

  it("fetchRoute transit uses google provider with API key", async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = "test-key";
    const fetchMock = mockFetchSequence([
      {
        json: {
          routes: [
            {
              legs: [{ duration: { value: 2400 }, distance: { value: 8000 } }],
              overview_polyline: { points: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" }
            }
          ]
        }
      }
    ]);

    const route = await fetchRoute("A", "B", "transit");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(route?.provider).toBe("google");
    expect(route?.durationMinutes).toBe(40);
  });
});
