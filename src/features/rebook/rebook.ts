import type { TravelOffer } from "@/features/planner/travelOffer";

// After capture, an activity that couldn't be booked is refunded to the
// traveller's PayPal and leaves a hole in the trip. These pure helpers decide
// which other activities from the same search could fill that hole; the
// rebooking agent only chooses among them, and the route re-checks its picks
// here, so the model never invents an offer, a price or a time.

/** A paid activity that wasn't booked: refunded, or failed and waiting on its refund. */
export type FreedActivity = {
  offer: TravelOffer;
  /** What went back (or is going back) to the traveller's PayPal for it. */
  refundMinorUnits: number;
  refunded: boolean;
};

export type StoredBooking = {
  offerId: string;
  status: string;
  amountMinorUnits: number;
  refundStatus: string | null;
};

export function freedActivities(offers: readonly TravelOffer[], bookings: readonly StoredBooking[]): FreedActivity[] {
  const byOffer = new Map(bookings.map((booking) => [booking.offerId, booking]));
  return offers
    .filter((offer) => offer.productKind === "activity")
    .flatMap((offer) => {
      const booking = byOffer.get(offer.id);
      if (!booking || (booking.status !== "failed" && !booking.refundStatus)) return [];
      return [{ offer, refundMinorUnits: booking.amountMinorUnits, refunded: Boolean(booking.refundStatus) }];
    });
}

const overlaps = (a: Pick<TravelOffer, "startsAt" | "endsAt">, b: Pick<TravelOffer, "startsAt" | "endsAt">) =>
  Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt);

/**
 * Activities from the quote's own search that could take the freed one's
 * place: not already in the trip, inside the travel dates, clear of every
 * flight and activity that is still booked, and no dearer than what was
 * refunded. Same-day options come first, then the closest in time.
 */
export function replacementCandidates(input: {
  freed: FreedActivity;
  /** Everything in the paid trip, booked or not. */
  tripOffers: readonly TravelOffer[];
  /** Every activity that was freed, so one hole isn't filled from another. */
  freedIds: ReadonlySet<string>;
  catalog: readonly TravelOffer[];
  travelWindow: { startsAt: string; endsAt: string };
  limit?: number;
}): TravelOffer[] {
  const { freed, tripOffers, freedIds, catalog, travelWindow } = input;
  const first = travelWindow.startsAt.slice(0, 10);
  const last = travelWindow.endsAt.slice(0, 10);
  const inTrip = new Set(tripOffers.map((offer) => offer.id));
  const kept = tripOffers.filter((offer) => offer.productKind !== "hotel" && !freedIds.has(offer.id));
  const day = freed.offer.startsAt.slice(0, 10);
  const at = Date.parse(freed.offer.startsAt);
  return catalog
    .filter((offer) => offer.productKind === "activity" && !inTrip.has(offer.id))
    .filter((offer) => offer.startsAt.slice(0, 10) >= first && offer.endsAt.slice(0, 10) <= last)
    .filter((offer) => Date.parse(offer.endsAt) > Date.parse(offer.startsAt))
    .filter((offer) => offer.costMinorUnits <= freed.refundMinorUnits)
    .filter((offer) => !kept.some((own) => overlaps(own, offer)))
    .sort(
      (a, b) =>
        Number(b.startsAt.slice(0, 10) === day) - Number(a.startsAt.slice(0, 10) === day) ||
        Math.abs(Date.parse(a.startsAt) - at) - Math.abs(Date.parse(b.startsAt) - at) ||
        a.costMinorUnits - b.costMinorUnits,
    )
    .slice(0, input.limit ?? 6);
}

export type RebookPick = { forOfferId: string; offerId: string; reason: string };

/**
 * The agent's picks that are actually allowed: each names a freed activity
 * and one of that activity's candidates, at most `perFreed` per hole, never
 * the same offer twice, and never two suggestions that overlap each other.
 */
export function acceptedPicks(
  picks: readonly RebookPick[],
  candidatesByFreed: ReadonlyMap<string, readonly TravelOffer[]>,
  perFreed = 2,
): { pick: RebookPick; offer: TravelOffer }[] {
  const out: { pick: RebookPick; offer: TravelOffer }[] = [];
  const count = new Map<string, number>();
  for (const pick of picks) {
    const offer = candidatesByFreed.get(pick.forOfferId)?.find((candidate) => candidate.id === pick.offerId);
    if (!offer) continue;
    if ((count.get(pick.forOfferId) ?? 0) >= perFreed) continue;
    if (out.some((taken) => taken.offer.id === offer.id)) continue;
    // Two suggestions for different holes mustn't collide with each other.
    if (out.some((taken) => taken.pick.forOfferId !== pick.forOfferId && overlaps(taken.offer, offer))) continue;
    count.set(pick.forOfferId, (count.get(pick.forOfferId) ?? 0) + 1);
    out.push({ pick: { ...pick, reason: pick.reason.trim().slice(0, 240) }, offer });
  }
  return out;
}
