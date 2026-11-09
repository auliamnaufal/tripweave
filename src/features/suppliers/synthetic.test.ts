import { describe, expect, it } from "vitest";
import { searchActivities, searchAllOffers, searchFlights, searchHotels } from "./synthetic";
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

const now = () => new Date("2026-07-01T00:00:00Z");

describe("synthetic suppliers", () => {
  it("returns deterministic offers within the trip window", () => {
    const flights = searchFlights(brief, now);
    const hotels = searchHotels(brief, now);
    const activities = searchActivities(brief, now);

    for (const offer of [...flights, ...hotels, ...activities]) {
      expect(offer.synthetic).toBe(true);
      expect(offer.retrievedAt).toBe("2026-07-01T00:00:00.000Z");
      expect(offer.expiresAt).toBe("2026-07-01T00:15:00.000Z");
      expect(Date.parse(offer.startsAt)).toBeGreaterThanOrEqual(Date.parse(brief.travelWindow.startsAt));
      expect(Date.parse(offer.endsAt)).toBeLessThanOrEqual(Date.parse(brief.travelWindow.endsAt));
    }

    expect(flights.map((offer) => offer.id)).toEqual(["flight-arrival", "flight-departure"]);
    expect(hotels.map((offer) => offer.id)).toEqual(["hotel-main"]);
    expect(activities.map((offer) => offer.id)).toEqual([
      "activity-0-beach",
      "activity-1-hike",
      "activity-2-food",
      "activity-3-market",
      "activity-4-sunset",
      "activity-5-cooking",
    ]);
  });

  it("returns a catalog with unique offer ids", () => {
    const offers = searchAllOffers(brief, now);
    const ids = offers.map((offer) => offer.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
