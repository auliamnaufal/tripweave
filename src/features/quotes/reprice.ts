import type { TravelOffer } from "@/features/planner/travelOffer";
import type { RepriceResult } from "@/features/suppliers/adapter";
import { repriceOffer } from "@/features/suppliers/registry";

export type QuoteRepricing =
  | { status: "unchanged"; offers: TravelOffer[] }
  | { status: "changed"; offers: TravelOffer[]; previousTotalMinorUnits: number; totalMinorUnits: number }
  | { status: "unavailable"; offerId: string; reason: string };

const total = (offers: readonly TravelOffer[]) => offers.reduce((sum, offer) => sum + offer.costMinorUnits, 0);

/**
 * Re-checks every offer with its own supplier right before PayPal is asked
 * for money. A supplier that can't answer throws: Tripweave never charges a
 * price it could not confirm.
 */
export async function repriceQuote(
  offers: readonly TravelOffer[],
  reprice: (offer: TravelOffer) => Promise<RepriceResult> = repriceOffer,
): Promise<QuoteRepricing> {
  const results = await Promise.all(offers.map((offer) => reprice(offer)));
  const fresh: TravelOffer[] = [];
  let changed = false;
  for (const [index, result] of results.entries()) {
    if (result.status === "unavailable") return { status: "unavailable", offerId: offers[index].id, reason: result.reason };
    if (result.offer.id !== offers[index].id) throw new Error(`Reprice answered for ${result.offer.id}, expected ${offers[index].id}.`);
    // Only a different price needs the traveller's say; a refreshed reference at the same price doesn't.
    if (result.status === "changed" && result.offer.costMinorUnits !== offers[index].costMinorUnits) changed = true;
    // Keep anything the quote added on top of the supplier's offer (e.g. a demo payee).
    // The supplier may hand back a new reference (e.g. a re-searched hotel rate): book that one.
    fresh.push({ ...offers[index], supplierRef: result.offer.supplierRef, costMinorUnits: result.offer.costMinorUnits, retrievedAt: result.offer.retrievedAt, expiresAt: result.offer.expiresAt });
  }
  return changed
    ? { status: "changed", offers: fresh, previousTotalMinorUnits: total(offers), totalMinorUnits: total(fresh) }
    : { status: "unchanged", offers: fresh };
}
