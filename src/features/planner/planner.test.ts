import { describe, expect, it } from "vitest";
import { buildItinerary, selectOffers } from "./planner";
import type { TripBrief } from "./tripBrief";
import type { TravelOffer } from "./travelOffer";
import { minorUnits, zonedDateTime } from "./types";

const brief: TripBrief = {
  origin: { city: "San Francisco", country: "United States" },
  destination: { city: "Honolulu", country: "United States" },
  timeZone: "Pacific/Honolulu",
  travelers: 2,
  travelWindow: {
    startsAt: zonedDateTime("2026-07-10T00:00:00-10:00"),
    endsAt: zonedDateTime("2026-07-15T23:59:59-10:00"),
  },
  hardBudget: { currency: "USD", amountMinorUnits: minorUnits(350000) },
  preferences: ["beach"],
  constraints: [],
};

function offer(id: string, overrides: Partial<TravelOffer> = {}): TravelOffer {
  return {
    id,
    supplier: "synthetic",
    supplierRef: `synthetic:${id}`,
    productKind: "activity",
    title: id,
    summary: id,
    startsAt: zonedDateTime("2026-07-10T12:00:00-10:00"),
    endsAt: zonedDateTime("2026-07-10T14:00:00-10:00"),
    costMinorUnits: minorUnits(10000),
    currency: "USD",
    retrievedAt: "2026-07-01T00:00:00Z",
    expiresAt: "2026-07-01T00:15:00Z",
    cancellationTerms: null,
    synthetic: true,
    ...overrides,
  };
}

describe("buildItinerary", () => {
  it("computes totals and remaining budget for a feasible plan", () => {
    const plan = buildItinerary(brief, [
      offer("a", {
        startsAt: zonedDateTime("2026-07-10T08:00:00-10:00"),
        endsAt: zonedDateTime("2026-07-10T11:00:00-10:00"),
        costMinorUnits: minorUnits(62000),
      }),
      offer("b", {
        startsAt: zonedDateTime("2026-07-11T08:00:00-10:00"),
        endsAt: zonedDateTime("2026-07-11T11:00:00-10:00"),
        costMinorUnits: minorUnits(18000),
      }),
    ]);

    expect(plan.status).toBe("feasible");
    expect(plan.totalCostMinorUnits).toBe(80000);
    expect(plan.budgetRemainingMinorUnits).toBe(270000);
    expect(plan.violations).toEqual([]);

    expect(plan.days.length).toBe(6);
    expect(plan.days.reduce((sum, day) => sum + day.subtotalMinorUnits, 0)).toBe(plan.totalCostMinorUnits);
    expect(plan.budgetByCategory.map((item) => item.productKind)).toEqual(["flight", "hotel", "activity"]);
    expect(plan.budgetByCategory.reduce((sum, item) => sum + item.subtotalMinorUnits, 0)).toBe(
      plan.totalCostMinorUnits,
    );
  });

  it("flags plans that exceed the hard budget", () => {
    const plan = buildItinerary(brief, [
      offer("expensive", { costMinorUnits: minorUnits(400000) }),
    ]);

    expect(plan.status).toBe("infeasible");
    expect(plan.budgetRemainingMinorUnits).toBeNull();
    expect(plan.violations).toEqual([
      { kind: "over-budget", totalCostMinorUnits: 400000, budgetMinorUnits: 350000 },
    ]);
  });

  it("flags overlapping offers as schedule conflicts", () => {
    const plan = buildItinerary(brief, [
      offer("first", {
        startsAt: zonedDateTime("2026-07-10T08:00:00-10:00"),
        endsAt: zonedDateTime("2026-07-10T12:00:00-10:00"),
      }),
      offer("second", {
        startsAt: zonedDateTime("2026-07-10T10:00:00-10:00"),
        endsAt: zonedDateTime("2026-07-10T13:00:00-10:00"),
      }),
    ]);

    expect(plan.status).toBe("infeasible");
    expect(plan.violations).toContainEqual({
      kind: "schedule-conflict",
      firstOfferId: "first",
      secondOfferId: "second",
    });
  });

  it("flags offers outside the trip window", () => {
    const plan = buildItinerary(brief, [
      offer("early", {
        startsAt: zonedDateTime("2026-07-09T08:00:00-10:00"),
        endsAt: zonedDateTime("2026-07-09T11:00:00-10:00"),
      }),
    ]);

    expect(plan.status).toBe("infeasible");
    expect(plan.violations).toContainEqual({ kind: "outside-trip-window", offerId: "early" });
  });

  it("keeps a return flight that lands late on the last local day inside the window", () => {
    const utcWindowBrief: TripBrief = {
      ...brief,
      travelWindow: {
        startsAt: zonedDateTime("2026-07-10T00:00:00Z"),
        endsAt: zonedDateTime("2026-07-15T23:59:59Z"),
      },
    };
    const plan = buildItinerary(utcWindowBrief, [
      offer("return", {
        productKind: "flight",
        startsAt: zonedDateTime("2026-07-15T15:00:00-10:00"),
        endsAt: zonedDateTime("2026-07-15T22:30:00-07:00"),
      }),
    ]);

    expect(plan.violations).not.toContainEqual({ kind: "outside-trip-window", offerId: "return" });
  });

  it("flags a return flight that lands the day after the trip ends", () => {
    const plan = buildItinerary(brief, [
      offer("redeye", {
        productKind: "flight",
        startsAt: zonedDateTime("2026-07-15T22:00:00-10:00"),
        endsAt: zonedDateTime("2026-07-16T06:00:00-07:00"),
      }),
    ]);

    expect(plan.violations).toContainEqual({ kind: "outside-trip-window", offerId: "redeye" });
  });

  it("does not treat a full-stay hotel as overlapping in-stay activities", () => {
    const plan = buildItinerary(brief, [
      offer("hotel", {
        productKind: "hotel",
        startsAt: zonedDateTime("2026-07-10T15:00:00-10:00"),
        endsAt: zonedDateTime("2026-07-15T10:00:00-10:00"),
      }),
      offer("activity", {
        startsAt: zonedDateTime("2026-07-12T08:00:00-10:00"),
        endsAt: zonedDateTime("2026-07-12T11:00:00-10:00"),
      }),
    ]);

    expect(plan.status).toBe("feasible");
  });

  it("flags offers with an invalid time range", () => {
    const plan = buildItinerary(brief, [
      offer("backwards", {
        startsAt: zonedDateTime("2026-07-10T14:00:00-10:00"),
        endsAt: zonedDateTime("2026-07-10T11:00:00-10:00"),
      }),
    ]);

    expect(plan.status).toBe("infeasible");
    expect(plan.violations).toContainEqual({ kind: "invalid-time-range", offerId: "backwards" });
  });
});

describe("selectOffers", () => {
  it("returns offers in the requested id order and rejects unknown ids", () => {
    const available = [
      offer("a", { costMinorUnits: minorUnits(1) }),
      offer("b", { costMinorUnits: minorUnits(2) }),
    ];

    expect(selectOffers(available, ["b", "a"]).map((item) => item.id)).toEqual(["b", "a"]);
    expect(() => selectOffers(available, ["missing"])).toThrow("Unknown offer id: missing");
  });
});
