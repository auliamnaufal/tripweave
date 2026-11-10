import { beforeEach, describe, expect, it, vi } from "vitest";
import { flightProductKey, repriceFlight, searchFlights } from "./duffel";
import type { TripBrief } from "@/features/planner/tripBrief";
import { minorUnits, zonedDateTime } from "@/features/planner/types";

const brief: TripBrief = {
  origin: { city: "San Francisco", country: "United States" },
  destination: { city: "Honolulu", country: "United States" },
  timeZone: "UTC",
  travelers: 2,
  travelWindow: {
    startsAt: zonedDateTime("2026-07-10T00:00:00Z"),
    endsAt: zonedDateTime("2026-07-15T23:59:59Z"),
  },
  hardBudget: { currency: "USD", amountMinorUnits: minorUnits(350000) },
  preferences: ["beach"],
  constraints: [],
};

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

// Branches on the request URL rather than call order or count, so it stays
// correct regardless of how the outbound/return legs interleave.
function mockDuffel(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    for (const [match, body] of Object.entries(routes)) {
      if (url.includes(match)) return jsonResponse(body);
    }
    return jsonResponse({ data: { offers: [] } });
  });
}

beforeEach(() => {
  process.env.DUFFEL_API_KEY = "test-key";
});

describe("searchFlights", () => {
  it("maps real offer-request responses into TravelOffer, tagged as not synthetic", async () => {
    const offer = {
      id: "off_1",
      total_amount: "310.00",
      total_currency: "USD",
      owner: { name: "Hawaiian Airlines" },
      slices: [
        {
          segments: [
            { departing_at: "2026-07-10T08:00:00", arriving_at: "2026-07-10T11:00:00" },
          ],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      mockDuffel({
        "query=San": { data: [{ iata_code: "SFO", time_zone: "UTC" }] },
        "query=Honolulu": { data: [{ iata_code: "HNL", time_zone: "UTC" }] },
        "offer_requests": { data: { offers: [offer] } },
      }),
    );

    const offers = await searchFlights(brief);

    expect(offers.length).toBeGreaterThan(0);
    const outbound = offers.find((item) => item.id === "flight-outbound-0");
    expect(outbound?.synthetic).toBe(false);
    expect(outbound?.costMinorUnits).toBe(31000);
    expect(outbound?.startsAt).toBe("2026-07-10T08:00:00+00:00");
    expect(outbound?.summary).toContain("Hawaiian Airlines");
  });

  it("skips a place match that has no time zone and uses the next one", async () => {
    const flightOffer = {
      id: "off-2",
      total_amount: "310.00",
      total_currency: "USD",
      slices: [
        {
          segments: [
            { departing_at: "2026-07-10T08:00:00", arriving_at: "2026-07-10T11:00:00" },
          ],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      mockDuffel({
        // The top match is a city entry with no time_zone; the airport entry after it has one.
        "query=San": { data: [{ iata_code: "SFO" }, { iata_code: "SFO", time_zone: "UTC" }] },
        "query=Honolulu": { data: [{ iata_code: "HNL", time_zone: "UTC" }] },
        "offer_requests": { data: { offers: [flightOffer] } },
      }),
    );

    const offers = await searchFlights(brief);

    expect(offers.find((item) => item.id === "flight-outbound-0")).toBeDefined();
  });

  it("converts a non-USD account currency to USD with a live rate", async () => {
    const offer = {
      id: "off_1",
      total_amount: "100.00",
      total_currency: "AUD",
      slices: [
        {
          segments: [
            { departing_at: "2026-07-10T08:00:00", arriving_at: "2026-07-10T11:00:00" },
          ],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      mockDuffel({
        "query=San": { data: [{ iata_code: "SFO", time_zone: "UTC" }] },
        "query=Honolulu": { data: [{ iata_code: "HNL", time_zone: "UTC" }] },
        "frankfurter.dev": { rates: { USD: 0.65 } },
        "offer_requests": { data: { offers: [offer] } },
      }),
    );

    const offers = await searchFlights(brief);
    const outbound = offers.find((item) => item.id === "flight-outbound-0");

    expect(outbound?.currency).toBe("USD");
    expect(outbound?.costMinorUnits).toBe(6500);
  });

  it("rejects when the destination place can't be resolved", async () => {
    vi.stubGlobal(
      "fetch",
      mockDuffel({
        "query=San": { data: [{ iata_code: "SFO", time_zone: "UTC" }] },
        "query=Honolulu": { data: [] },
      }),
    );

    await expect(searchFlights(brief)).rejects.toThrow('No place match with a known timezone for "Honolulu".');
  });
});

describe("repriceFlight", () => {
  const searched = {
    id: "flight-outbound-0",
    supplier: "duffel",
    supplierRef: "duffel:off_1",
    productKind: "flight" as const,
    title: "SFO to HNL, direct",
    summary: "",
    startsAt: zonedDateTime("2026-07-10T08:00:00+00:00"),
    endsAt: zonedDateTime("2026-07-10T11:00:00+00:00"),
    costMinorUnits: minorUnits(31000),
    currency: "USD" as const,
    retrievedAt: "2026-07-01T00:00:00Z",
    expiresAt: "2026-07-01T00:15:00Z",
    cancellationTerms: null,
    synthetic: false,
  };

  function stubOffer(response: { ok: boolean; status: number; body?: unknown }) {
    const fetchMock = vi.fn<(url: string) => Promise<unknown>>(async () => ({ ok: response.ok, status: response.status, json: async () => response.body }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("re-reads the offer by its Duffel id and reports an unchanged price", async () => {
    const fetchMock = stubOffer({ ok: true, status: 200, body: { data: { id: "off_1", total_amount: "310.00", total_currency: "USD", slices: [] } } });
    const result = await repriceFlight(searched);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.duffel.com/air/offers/off_1");
    expect(result.status).toBe("unchanged");
  });

  it("reports a moved price with the old one", async () => {
    stubOffer({ ok: true, status: 200, body: { data: { id: "off_1", total_amount: "335.50", total_currency: "USD", slices: [] } } });
    const result = await repriceFlight(searched);
    expect(result).toMatchObject({ status: "changed", previousMinorUnits: 31000, offer: { costMinorUnits: 33550 } });
  });

  it("treats a 404 or an expired offer as unavailable, not as an error", async () => {
    stubOffer({ ok: false, status: 404 });
    expect((await repriceFlight(searched)).status).toBe("unavailable");
    stubOffer({ ok: true, status: 200, body: { data: { id: "off_1", total_amount: "310.00", total_currency: "USD", expires_at: "2020-01-01T00:00:00Z", slices: [] } } });
    expect((await repriceFlight(searched)).status).toBe("unavailable");
  });

  it("surfaces a Duffel outage as an error instead of guessing", async () => {
    stubOffer({ ok: false, status: 503 });
    await expect(repriceFlight(searched)).rejects.toThrow("(503)");
  });
});

describe("flightProductKey", () => {
  it("identifies the same flights on any platform by carrier, flight number and local departure", () => {
    expect(
      flightProductKey([
        { departing_at: "2026-12-10T06:58:00", arriving_at: "2026-12-10T15:00:00", marketing_carrier: { iata_code: "AA" }, marketing_carrier_flight_number: "123" },
        { departing_at: "2026-12-10T17:00:00", arriving_at: "2026-12-11T03:42:00", marketing_carrier: { iata_code: "IB" }, marketing_carrier_flight_number: "4" },
      ]),
    ).toBe("flight:AA123+IB4@2026-12-10T06:58");
  });

  it("gives no key when any segment's flight number is unknown, so nothing is merged by guess", () => {
    expect(flightProductKey([{ departing_at: "2026-12-10T06:58:00", arriving_at: "2026-12-10T15:00:00" }])).toBeUndefined();
  });
});
