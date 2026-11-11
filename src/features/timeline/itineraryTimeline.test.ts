import { describe, expect, it } from "vitest";
import type { TravelOfferView } from "@/features/planner/travelOffer";
import { itineraryTimeline, wallClock } from "./itineraryTimeline";

function offer(over: Partial<TravelOfferView>): TravelOfferView {
  return {
    id: "o",
    supplier: "synthetic",
    supplierRef: "ref",
    productKind: "activity",
    title: "Offer",
    summary: "",
    startsAt: "2026-12-11T09:00:00+09:00",
    endsAt: "2026-12-11T12:00:00+09:00",
    costMinorUnits: 5_000,
    currency: "USD",
    retrievedAt: "2026-11-11T00:00:00Z",
    expiresAt: "2026-11-12T00:00:00Z",
    cancellationTerms: null,
    synthetic: true,
    ...over,
  };
}

const window = { startsAt: "2026-12-10T00:00:00Z", endsAt: "2026-12-14T23:59:59Z" };

describe("wallClock", () => {
  it("reads the clock time where it happens, ignoring the offset", () => {
    const d = wallClock("2026-12-10T08:15:00+09:00");
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 11, 10, 8, 15]);
  });

  it("refuses something that is not a date", () => {
    expect(() => wallClock("soon")).toThrow();
  });
});

describe("itineraryTimeline", () => {
  it("puts each offer on its kind's row, earliest first", () => {
    const model = itineraryTimeline(
      {
        offers: [
          offer({ id: "act", productKind: "activity" }),
          offer({ id: "out", productKind: "flight", startsAt: "2026-12-10T06:00:00+07:00", endsAt: "2026-12-10T15:00:00+09:00" }),
        ],
        violations: [],
      },
      window,
    );
    expect(model.bars.map((b) => [b.id, b.resourceId])).toEqual([
      ["out", "flight"],
      ["act", "activity"],
    ]);
    expect(model.rows.map((r) => r.id)).toEqual(["flight", "hotel", "activity"]);
  });

  it("keeps a flight's real length when it lands earlier on the clock than it left", () => {
    // Tokyo 17:00 to Honolulu 06:00 the same morning: about 7 hours in the air.
    const [bar] = itineraryTimeline(
      { offers: [offer({ productKind: "flight", startsAt: "2026-12-14T17:00:00+09:00", endsAt: "2026-12-14T05:00:00-10:00" })], violations: [] },
      window,
    ).bars;
    expect(bar.startDate.getHours()).toBe(17);
    expect((bar.endDate.getTime() - bar.startDate.getTime()) / 3_600_000).toBe(7);
  });

  it("flags both sides of a schedule conflict and names the other one", () => {
    const model = itineraryTimeline(
      {
        offers: [offer({ id: "a", title: "Tea ceremony" }), offer({ id: "b", title: "Sumo practice" }), offer({ id: "c", title: "Ramen walk", startsAt: "2026-12-12T18:00:00+09:00", endsAt: "2026-12-12T20:00:00+09:00" })],
        violations: [
          { kind: "schedule-conflict", firstOfferId: "a", secondOfferId: "b" },
          { kind: "outside-trip-window", offerId: "c" },
        ],
      },
      window,
    );
    const by = Object.fromEntries(model.bars.map((b) => [b.id, b]));
    expect(by.a.flags).toEqual(["conflict"]);
    expect(by.a.conflictsWith).toEqual(["Sumo practice"]);
    expect(by.b.conflictsWith).toEqual(["Tea ceremony"]);
    expect(by.c.flags).toEqual(["outside-window"]);
  });

  it("ignores a violation that names an offer not in the plan", () => {
    const model = itineraryTimeline({ offers: [offer({ id: "a" })], violations: [{ kind: "outside-trip-window", offerId: "gone" }] }, window);
    expect(model.bars[0].flags).toEqual([]);
  });

  it("spans whole days from the window start to past the last bar", () => {
    const model = itineraryTimeline(
      { offers: [offer({ id: "late", startsAt: "2026-12-15T20:00:00+09:00", endsAt: "2026-12-15T23:00:00+09:00" })], violations: [] },
      window,
    );
    expect(model.startDate).toEqual(new Date(2026, 11, 10));
    expect(model.endDate).toEqual(new Date(2026, 11, 16));
  });
});

describe("booking outcomes", () => {
  const plan = { offers: [offer({ id: "a" }), offer({ id: "b" }), offer({ id: "c" })], violations: [] };

  it("attaches what happened to each paid offer", () => {
    const model = itineraryTimeline(plan, window, [
      { offerId: "a", status: "booked", bookingRef: "TW-123", failureReason: null, refunded: false },
      { offerId: "b", status: "failed", bookingRef: null, failureReason: "Sold out", refunded: true },
    ]);
    const by = Object.fromEntries(model.bars.map((b) => [b.id, b.outcome]));
    expect(by.a).toEqual({ state: "booked", bookingRef: "TW-123" });
    expect(by.b).toEqual({ state: "refunded", reason: "Sold out" });
    expect(by.c).toBeUndefined();
  });

  it("keeps a failed booking that has no refund yet apart from a refunded one", () => {
    const [bar] = itineraryTimeline({ offers: [offer({ id: "a" })], violations: [] }, window, [
      { offerId: "a", status: "failed", bookingRef: null, failureReason: "Supplier down", refunded: false },
    ]).bars;
    expect(bar.outcome).toEqual({ state: "failed", reason: "Supplier down" });
  });
});
