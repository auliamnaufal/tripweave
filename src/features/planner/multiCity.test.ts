import { describe, expect, it } from "vitest";
import { parseTripBrief, tripBriefSchema } from "./tripBrief";
import { stayForDay, tripLegs, tripStays } from "./itinerary";
import { briefFromIntent, intentSchema, type TripIntent } from "@/features/agent/intake";
import { searchActivities, searchHotels } from "@/features/suppliers/synthetic";
import { activityOptionsFor, alternativesFor, checkEdit, choicesFor, slotOf, swapOffer } from "@/features/suppliers/alternatives";
import { toTravelOffer, type TravelOffer } from "./travelOffer";


const japan = parseTripBrief({
  origin: { city: "San Francisco", country: "United States" },
  destination: { city: "Tokyo", country: "Japan" },
  timeZone: "UTC",
  travelers: 2,
  travelWindow: { startsAt: "2026-12-10T00:00:00Z", endsAt: "2026-12-13T23:59:59Z" },
  hardBudget: { currency: "USD", amountMinorUnits: 500000 },
  preferences: [],
  constraints: [],
  stops: [
    { city: "Tokyo", country: "Japan", nights: 1 },
    { city: "Osaka", country: "Japan", nights: 2 },
  ],
  dayPlans: [{ day: 3, wish: "Mount Fuji" }],
});

describe("multi-city itinerary", () => {
  it("lays out one stay per stop, back to back, and one flight per leg", () => {
    expect(tripStays(japan).map((stay) => [stay.city, stay.firstDay, stay.nights])).toEqual([
      ["Tokyo", 1, 1],
      ["Osaka", 2, 2],
    ]);
    expect(tripLegs(japan).map((leg) => [leg.label, leg.from.city, leg.to.city, leg.date])).toEqual([
      ["outbound", "San Francisco", "Tokyo", "2026-12-10"],
      ["leg1", "Tokyo", "Osaka", "2026-12-11"],
      ["return", "Osaka", "San Francisco", "2026-12-13"],
    ]);
    expect(stayForDay(japan, 3).city).toBe("Osaka");
  });

  it("refuses stops that add up to more nights than the trip, or don't start at the destination", () => {
    // One night of slack is allowed (arrival-day rounding); three stop-nights in a one-night window is not.
    const base = { ...japan, travelWindow: { startsAt: "2026-12-10T00:00:00Z", endsAt: "2026-12-10T23:59:59Z" } };
    expect(tripBriefSchema.safeParse(base).success).toBe(false);
    expect(tripBriefSchema.safeParse({ ...japan, destination: { city: "Osaka", country: "Japan" } }).success).toBe(false);
  });

  it("offers a stay in each city and turns the day-3 wish into a full-day trip on day 3", () => {
    const now = () => new Date("2026-11-10T00:00:00Z");
    const hotels = searchHotels(japan, now);
    expect(new Set(hotels.map((hotel) => hotel.startsAt.slice(0, 10)))).toEqual(new Set(["2026-12-10", "2026-12-11"]));
    const fuji = searchActivities(japan, now).find((activity) => activity.id.includes("wish"));
    expect(fuji).toMatchObject({ title: "Mount Fuji day trip", costMinorUnits: 120 * 2 * 100 });
    expect(fuji?.startsAt.slice(0, 13)).toBe("2026-12-12T08");
  });
});

describe("intake → brief", () => {
  const intent: TripIntent = {
    clarification: null,
    origin: null,
    startDate: "2020-01-01",
    travelers: null,
    budgetUsd: null,
    stops: [
      { city: "Tokyo", country: "Japan", nights: 1 },
      { city: "Osaka", country: "Japan", nights: 1 },
    ],
    dayPlans: [{ day: 3, wish: "Mount Fuji" }, { day: 9, wish: "beyond the trip" }],
    preferences: [],
    summary: "Tokyo then Osaka",
  };

  it("fills the traveller's defaults, never starts in the past, and drops wishes past the last day", () => {
    const brief = briefFromIntent(intent, { origin: { city: "Jakarta", country: "Indonesia" }, travelers: 2, budgetUsd: 3000 }, new Date("2026-11-11T00:00:00Z"))!;
    expect(brief.origin.city).toBe("Jakarta");
    expect(brief.travelWindow.startsAt >= "2026-11-14").toBe(true);
    expect(brief.destination.city).toBe("Tokyo");
    expect(brief.stops).toHaveLength(2);
    expect(brief.dayPlans).toEqual([{ day: 3, wish: "Mount Fuji" }]);
    expect(brief.hardBudget.amountMinorUnits).toBe(300000);
  });

  it("reads an origin the model wrote as a bare string instead of failing", () => {
    const defaults = { origin: { city: "Jakarta", country: "Indonesia" }, travelers: 2, budgetUsd: 3000 };
    const today = new Date("2026-11-11T00:00:00Z");
    const read = (origin: unknown) => intentSchema.parse({ ...intent, origin }).origin;

    expect(read("Jakarta")).toEqual({ city: "Jakarta", country: null });
    expect(read("Surabaya, Indonesia")).toEqual({ city: "Surabaya", country: "Indonesia" });
    expect(read({ city: "Bandung", country: "Indonesia" })).toEqual({ city: "Bandung", country: "Indonesia" });
    expect(read(null)).toBeNull();

    // Same city as the default: its country comes from the default.
    expect(briefFromIntent({ ...intent, origin: read("Jakarta") }, defaults, today)!.origin).toEqual({ city: "Jakarta", country: "Indonesia" });
    expect(briefFromIntent({ ...intent, origin: read("Surabaya, Indonesia") }, defaults, today)!.origin).toEqual({ city: "Surabaya", country: "Indonesia" });
  });

  it("still refuses a bare-string origin that is the destination itself", () => {
    const defaults = { origin: { city: "Jakarta", country: "Indonesia" }, travelers: 2, budgetUsd: 3000 };
    const today = new Date("2026-11-11T00:00:00Z");
    const origin = intentSchema.parse({ ...intent, origin: "Tokyo" }).origin;
    // The country comes from the matching stop, not the city, so Tokyo -> Tokyo is caught.
    expect(() => briefFromIntent({ ...intent, origin }, defaults, today)).toThrow(/different from where you're flying from/);
  });

  it("returns nothing to plan when no destination was understood", () => {
    expect(briefFromIntent({ ...intent, stops: [] }, { origin: { city: "Jakarta", country: "Indonesia" }, travelers: 1, budgetUsd: 1000 })).toBeNull();
  });
});

function offer(id: string, kind: TravelOffer["productKind"], cost: number, startsAt = "2026-12-10T15:00:00Z", endsAt = "2026-12-11T10:00:00Z"): TravelOffer {
  return toTravelOffer({
    id,
    supplier: "synthetic",
    supplierRef: `synthetic:${id}`,
    productKind: kind,
    title: kind === "flight" ? "SFO to NRT, direct" : id,
    summary: "",
    startsAt,
    endsAt,
    costMinorUnits: cost,
    currency: "USD",
    retrievedAt: "2026-11-10T00:00:00Z",
    expiresAt: "2026-11-10T00:15:00Z",
    cancellationTerms: null,
    synthetic: true,
  });
}

describe("instant swaps", () => {
  const out0 = offer("flight-outbound-0", "flight", 40000);
  const out1 = offer("flight-nt-outbound-1", "flight", 35000);
  const leg1 = offer("flight-leg1-0", "flight", 9000);
  const hotelA = offer("hotel-a", "hotel", 30000);
  const hotelB = offer("hotel-b", "hotel", 25000);
  const hotelOtherStay = offer("hotel-c", "hotel", 1000, "2026-12-11T15:00:00Z", "2026-12-13T10:00:00Z");
  const catalog = [out0, out1, leg1, hotelA, hotelB, hotelOtherStay];
  const plan = [out0, leg1, hotelA];

  it("groups options by flight leg and by stay dates", () => {
    expect(slotOf(out1)).toBe("flight:outbound");
    expect(slotOf(leg1)).toBe("flight:leg1");
    expect(slotOf(hotelA)).toBe(slotOf(hotelB));
    expect(slotOf(hotelA)).not.toBe(slotOf(hotelOtherStay));
    const slots = alternativesFor(plan, catalog);
    expect(slots.find((slot) => slot.slot === "flight:outbound")?.options.map((o) => o.offerId)).toEqual(["flight-nt-outbound-1", "flight-outbound-0"]);
  });

  it("swaps within a slot and refuses anything that would change the trip's shape", () => {
    const swapped = swapOffer(plan, catalog, "hotel-a", "hotel-b");
    expect("offers" in swapped && swapped.offers.map((o) => o.id)).toEqual(["flight-outbound-0", "flight-leg1-0", "hotel-b"]);
    expect(swapOffer(plan, catalog, "hotel-a", "hotel-c")).toMatchObject({ error: expect.any(String) });
    expect(swapOffer(plan, catalog, "flight-outbound-0", "flight-leg1-0")).toMatchObject({ error: expect.any(String) });
    expect(swapOffer(plan, catalog, "hotel-a", "not-in-search")).toMatchObject({ error: expect.any(String) });
  });
});

describe("editing a plan until it's paid", () => {
  const out0 = offer("flight-outbound-0", "flight", 40000);
  const out1 = offer("flight-nt-outbound-1", "flight", 35000);
  const hotelA = offer("hotel-a", "hotel", 30000);
  const hotelB = offer("hotel-b", "hotel", 25000);
  const tea = offer("act-tea", "activity", 4000, "2026-12-11T10:00:00Z", "2026-12-11T12:00:00Z");
  const walk = offer("act-walk", "activity", 0, "2026-12-11T11:00:00Z", "2026-12-11T13:00:00Z");
  const late = offer("act-late", "activity", 2000, "2027-01-20T10:00:00Z", "2027-01-20T12:00:00Z");
  const plan = [out0, hotelA, tea];
  const catalog = [out0, out1, hotelA, hotelB, tea, walk, late];
  const window = { startsAt: "2026-12-10T00:00:00Z", endsAt: "2026-12-13T23:59:59Z" };

  it("allows swaps within a slot and any set of activities, nothing that changes the trip's shape", () => {
    expect(checkEdit(plan, [out1, hotelB])).toBeNull();
    expect(checkEdit(plan, [out0, hotelA, tea, walk])).toBeNull();
    expect(checkEdit(plan, [out0, tea])).toMatch(/same leg or dates/);
    expect(checkEdit(plan, [out0, out1, hotelA])).toMatch(/same leg or dates/);
    expect(checkEdit(plan, [out0, hotelA, tea, tea])).toMatch(/twice/);
  });

  it("offers the plan's activities plus others inside the trip window, in time order", () => {
    const options = activityOptionsFor(plan, catalog, window);
    expect(options.map((o) => o.offerId)).toEqual(["act-tea", "act-walk"]);
  });

  it("sends full offers for every option, so the browser can rebuild the plan on a tap", () => {
    const slots = alternativesFor(plan, catalog);
    const ids = choicesFor(slots, activityOptionsFor(plan, catalog, window), catalog).map((o) => o.id).sort();
    expect(ids).toEqual(["act-tea", "act-walk", "flight-nt-outbound-1", "flight-outbound-0", "hotel-a", "hotel-b"]);
  });
});
