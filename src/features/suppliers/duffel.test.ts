import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchFlights } from "./duffel";
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
