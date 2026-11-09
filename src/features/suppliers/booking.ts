import type { TravelOffer } from "@/features/planner/travelOffer";

export type BookingResult =
  | { offerId: string; status: "booked"; bookingRef: string }
  | { offerId: string; status: "failed"; reason: string };

// ponytail: every booking here is simulated. Real order creation is gated for
// both legs: Duffel's card payment method "requires approval to access" and its
// balance method needs a real bank-funded prefund; Duffel Stays and Booking.com
// both require requesting partner access first. None clear self-serve in the
// hackathon window. Upgrade to a real supplier call here once access exists —
// see docs/research/paypal-agent-oneshot-payment-mechanisms-2026-11-09.md.
export function simulateBooking(offer: TravelOffer, forceFail: boolean): BookingResult {
  if (forceFail) {
    return {
      offerId: offer.id,
      status: "failed",
      reason: "Price or availability changed before booking (simulated).",
    };
  }
  return {
    offerId: offer.id,
    status: "booked",
    bookingRef: `SIM-${offer.supplier.toUpperCase()}-${offer.id}`,
  };
}

export type Reconciliation = {
  bookedMinorUnits: number;
  refundedMinorUnits: number;
  refunds: { offerId: string; amountMinorUnits: number }[];
};

/**
 * Proves the "pool" invariant: every paid offer got exactly one outcome, and
 * booked + refunded reconstructs the captured payment exactly. Throws instead
 * of returning a silently wrong total — this is the trust boundary between
 * "the agent says it booked things" and "money actually reconciles".
 */
export function reconcileBookings(
  offers: readonly TravelOffer[],
  results: readonly BookingResult[],
  capturedAmountMinorUnits: number,
): Reconciliation {
  const byId = new Map(offers.map((offer) => [offer.id, offer]));
  const seen = new Set<string>();
  let bookedMinorUnits = 0;
  const refunds: { offerId: string; amountMinorUnits: number }[] = [];

  for (const result of results) {
    const offer = byId.get(result.offerId);
    if (!offer) throw new Error(`Booking result for unknown offer id: ${result.offerId}`);
    if (seen.has(result.offerId)) throw new Error(`Duplicate booking result for offer id: ${result.offerId}`);
    seen.add(result.offerId);
    if (result.status === "booked") bookedMinorUnits += offer.costMinorUnits;
    else refunds.push({ offerId: offer.id, amountMinorUnits: offer.costMinorUnits });
  }

  if (seen.size !== offers.length) {
    throw new Error("Booking agent did not return a result for every paid offer.");
  }

  const refundedMinorUnits = refunds.reduce((sum, item) => sum + item.amountMinorUnits, 0);
  if (bookedMinorUnits + refundedMinorUnits !== capturedAmountMinorUnits) {
    throw new Error("Booked and refunded totals do not reconcile with the captured payment.");
  }

  return { bookedMinorUnits, refundedMinorUnits, refunds };
}
