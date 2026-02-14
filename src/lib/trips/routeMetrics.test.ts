// Tests unitaires pour valider le comportement de `routeMetrics` et prévenir les régressions.
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

  it("calculates driving travel time and distance from OSRM", async () => {
    mockFetchSequence([
      { json: { features: [{ geometry: { coordinates: [2.35, 48.86] } }] } },
      { json: { features: [{ geometry: { coordinates: [2.37, 48.88] } }] } },
      {
        json: {
          code: "Ok",
          routes: [
            {
              geometry: { coordinates: [[2.35, 48.86], [2.37, 48.88]] },
              duration: 1260,
              distance: 8400
            }
          ]
        }
      }
    ]);

    const route = await fetchRoute("Paris A", "Paris B", "driving");

    expect(route?.provider).toBe("osrm");
    expect(route?.durationMinutes).toBe(21);
    expect(route?.distanceKm).toBe(8.4);
    expect(route?.coords.length).toBe(2);
  });

  it("returns null when no route can be computed between the 2 addresses", async () => {
    mockFetchSequence([
      { json: { features: [] } },
      { json: { results: [] } },
      { json: { results: [] } },
      { json: { features: [] } },
      { json: { results: [] } },
      { json: { results: [] } }
    ]);

    const route = await fetchRoute("Adresse inconnue 1", "Adresse inconnue 2", "driving");

    expect(route).toBeNull();
  });

  it("uses Google metrics for transit when API key is configured", async () => {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = "test-key";
    mockFetchSequence([
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
