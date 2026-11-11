import { describe, expect, it } from "vitest";
import { toTravelOffer, type TravelOfferView } from "@/features/planner/travelOffer";
import type { BookingRecord } from "@/features/quotes/quote";
import { auditTripOrders, bookingOutcome, buildInsights, type PaidQuote } from "./insightsData";

function offer(over: Partial<TravelOfferView>) {
  return toTravelOffer({
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
  });
}

const brief = {
  origin: { city: "Jakarta", country: "Indonesia" },
  destination: { city: "Tokyo", country: "Japan" },
  timeZone: "Asia/Tokyo",
  travelers: 2,
  travelWindow: { startsAt: "2026-12-10T00:00:00Z", endsAt: "2026-12-14T23:59:59Z" },
  hardBudget: { currency: "USD", amountMinorUnits: 300_000 },
  preferences: [],
  constraints: [],
};

function quote(over: Partial<PaidQuote> = {}): PaidQuote {
  return {
    id: "q1",
    offers: [offer({ id: "f", productKind: "flight", costMinorUnits: 60_000, supplier: "duffel", synthetic: false }), offer({ id: "a", costMinorUnits: 15_000 })],
    totalMinorUnits: 75_000,
    status: "completed",
    paypalOrderId: "PP-1",
    brief,
    travellers: [],
    createdAt: "2026-11-11T10:00:00Z",
    ...over,
  };
}

const booking = (over: Partial<BookingRecord>): BookingRecord => ({
  offerId: "f",
  status: "booked",
  amountMinorUnits: 60_000,
  bookingRef: "DUF-1",
  failureReason: null,
  refundStatus: null,
  ...over,
});

describe("bookingOutcome", () => {
  it("lets a refund win over the failure it settled", () => {
    expect(bookingOutcome({ status: "failed", refundStatus: "COMPLETED" })).toBe("Refunded");
    expect(bookingOutcome({ status: "failed", refundStatus: null })).toBe("Failed");
    expect(bookingOutcome(undefined)).toBe("Pending");
  });
});

describe("buildInsights", () => {
  it("splits what was paid into booked and refunded, and checks it adds up", () => {
    const { trips, bookings } = buildInsights([
      { quote: quote(), bookings: [booking({}), booking({ offerId: "a", status: "failed", amountMinorUnits: 15_000, bookingRef: null, refundStatus: "COMPLETED" })] },
    ]);
    expect(trips).toEqual([
      expect.objectContaining({ trip: "Tokyo · Dec 10", paidUsd: 750, bookedUsd: 600, refundedUsd: 150, pendingUsd: 0, reconciles: "Yes", paypalOrderId: "PP-1", travellers: 2 }),
    ]);
    expect(bookings.map((b) => [b.kind, b.outcome, b.amountUsd, b.data])).toEqual([
      ["Flight", "Booked", 600, "Live"],
      ["Activity", "Refunded", 150, "Simulated"],
    ]);
  });

  it("flags a trip whose stored amounts don't reconstruct the captured total", () => {
    const { trips } = buildInsights([{ quote: quote({ totalMinorUnits: 80_000 }), bookings: [booking({})] }]);
    expect(trips[0].reconciles).toBe("No");
  });

  it("still labels a trip whose brief can't be read", () => {
    const { trips } = buildInsights([{ quote: quote({ brief: { nope: true } }), bookings: [] }]);
    expect(trips[0].trip).toBe("Trip · Nov 11");
    expect(trips[0].destination).toBe("Unknown");
  });
});

describe("auditTripOrders", () => {
  it("lists only the lines that weren't booked, per Trip Order", () => {
    const data = buildInsights([
      { quote: quote(), bookings: [booking({}), booking({ offerId: "a", status: "failed", amountMinorUnits: 15_000, refundStatus: "COMPLETED" })] },
      { quote: quote({ id: "q2", paypalOrderId: "PP-2" }), bookings: [booking({}), booking({ offerId: "a", amountMinorUnits: 15_000 })] },
    ]);
    const [first, second] = auditTripOrders(data);
    expect(first.exceptions).toEqual([{ item: "Offer", platform: expect.any(String), amountUsd: 150, outcome: "Refunded" }]);
    expect(first.reconciles).toBe(true);
    expect(second.exceptions).toEqual([]);
    expect(auditTripOrders(data, "PP-2").map((a) => a.paypalOrderId)).toEqual(["PP-2"]);
  });
});
