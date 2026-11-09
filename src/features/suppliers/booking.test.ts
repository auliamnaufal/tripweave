import { describe, expect, it } from "vitest";
import { reconcileBookings, simulateBooking, type BookingResult } from "./booking";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";

function offer(id: string, costMinorUnits: number, productKind: TravelOffer["productKind"] = "hotel"): TravelOffer {
  return {
    id,
    supplier: "synthetic",
    supplierRef: `synthetic:${id}`,
    productKind,
    title: id,
    summary: "",
    startsAt: zonedDateTime("2026-07-10T00:00:00Z"),
    endsAt: zonedDateTime("2026-07-11T00:00:00Z"),
    costMinorUnits: minorUnits(costMinorUnits),
    currency: "USD",
    retrievedAt: "2026-07-01T00:00:00Z",
    expiresAt: "2026-07-01T00:15:00Z",
    cancellationTerms: null,
    synthetic: true,
  };
}

describe("simulateBooking", () => {
  it("books successfully when not forced to fail", () => {
    const result = simulateBooking(offer("hotel-main", 95000), false);
    expect(result).toEqual({ offerId: "hotel-main", status: "booked", bookingRef: "SIM-SYNTHETIC-hotel-main" });
  });

  it("fails deterministically when forced", () => {
    const result = simulateBooking(offer("activity-0-beach", 2500), true);
    expect(result.status).toBe("failed");
    expect(result.offerId).toBe("activity-0-beach");
  });
});

describe("reconcileBookings", () => {
  const offers = [offer("flight-1", 62000, "flight"), offer("hotel-main", 95000, "hotel")];

  it("reconciles when everything books", () => {
    const results: BookingResult[] = [
      { offerId: "flight-1", status: "booked", bookingRef: "ref-1" },
      { offerId: "hotel-main", status: "booked", bookingRef: "ref-2" },
    ];

    expect(reconcileBookings(offers, results, 157000)).toEqual({
      bookedMinorUnits: 157000,
      refundedMinorUnits: 0,
      refunds: [],
    });
  });

  it("reconciles a partial failure into a refund for that item's share", () => {
    const results: BookingResult[] = [
      { offerId: "flight-1", status: "booked", bookingRef: "ref-1" },
      { offerId: "hotel-main", status: "failed", reason: "sold out" },
    ];

    expect(reconcileBookings(offers, results, 157000)).toEqual({
      bookedMinorUnits: 62000,
      refundedMinorUnits: 95000,
      refunds: [{ offerId: "hotel-main", amountMinorUnits: 95000 }],
    });
  });

  it("throws when a result is missing for a paid offer", () => {
    const results: BookingResult[] = [{ offerId: "flight-1", status: "booked", bookingRef: "ref-1" }];
    expect(() => reconcileBookings(offers, results, 157000)).toThrow(
      "Booking agent did not return a result for every paid offer.",
    );
  });

  it("throws when the booked+refunded total doesn't match what was captured", () => {
    const results: BookingResult[] = [
      { offerId: "flight-1", status: "booked", bookingRef: "ref-1" },
      { offerId: "hotel-main", status: "booked", bookingRef: "ref-2" },
    ];
    expect(() => reconcileBookings(offers, results, 1)).toThrow(
      "Booked and refunded totals do not reconcile with the captured payment.",
    );
  });

  it("throws on a result for an offer id that wasn't paid for", () => {
    const results: BookingResult[] = [
      { offerId: "flight-1", status: "booked", bookingRef: "ref-1" },
      { offerId: "hotel-main", status: "booked", bookingRef: "ref-2" },
      { offerId: "mystery", status: "booked", bookingRef: "ref-3" },
    ];
    expect(() => reconcileBookings(offers, results, 157000)).toThrow("unknown offer id: mystery");
  });
});
