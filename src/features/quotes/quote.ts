import type { TravelOffer } from "@/features/planner/travelOffer";

/**
 * A Plan Quote: the itinerary exactly as the server priced it. It is the only
 * input PayPal order creation and capture accept, so prices, payees and the
 * list of things to book never come from the browser.
 */
export type QuoteStatus = "quoted" | "ordered" | "capturing" | "completed" | "needs_attention";

export type PlanQuote = {
  id: string;
  userId: string | null;
  offers: TravelOffer[];
  totalMinorUnits: number;
  status: QuoteStatus;
  paypalOrderId: string | null;
  approveUrl: string | null;
  expiresAt: string;
  /** The TripBrief the quote was priced for, as stored. Parse before use. */
  brief?: unknown;
  /** Names entered at checkout; suppliers book under them and tickets print them. */
  travellers?: Traveller[];
};

export type Traveller = { firstName: string; lastName: string; email?: string };

/** "Mara Okafor" → { firstName: "Mara", lastName: "Okafor" }; a single word becomes both. */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Guest", lastName: "Traveller" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

export type BookingStatus = "pending" | "booked" | "failed" | "paid_direct";

export type BookingRecord = {
  offerId: string;
  status: BookingStatus;
  amountMinorUnits: number;
  bookingRef: string | null;
  failureReason: string | null;
  refundStatus: string | null;
};

/** The quote is only as fresh as its stalest offer. */
export function quoteExpiry(offers: readonly TravelOffer[]): string {
  const earliest = Math.min(...offers.map((offer) => Date.parse(offer.expiresAt)));
  return new Date(earliest).toISOString();
}

export function quoteTotal(offers: readonly TravelOffer[]): number {
  return offers.reduce((sum, offer) => sum + offer.costMinorUnits, 0);
}

export function isExpired(quote: Pick<PlanQuote, "expiresAt">, now = Date.now()): boolean {
  return Date.parse(quote.expiresAt) <= now;
}

/**
 * Whether this caller may act on the quote. A guest quote (no owner) can be
 * paid by whoever holds its unguessable id; an owned quote only by its owner.
 */
export function canAccess(quote: Pick<PlanQuote, "userId">, userId: string | null | undefined): boolean {
  return quote.userId === null || quote.userId === userId;
}

export function demoModeEnabled(): boolean {
  return process.env.DEMO_MODE === "true";
}

/**
 * Which paid offer to fail on purpose, if any (issue #14). Only in DEMO_MODE:
 * an explicit request (from /lab) wins; otherwise the earliest activity fails
 * every time, so the refund flow shows up reliably in a demo. Outside demo
 * mode nothing is ever forced, whatever the request says.
 */
export function demoFailureOfferId(offers: readonly TravelOffer[], requested?: string): string | undefined {
  if (!demoModeEnabled()) return undefined;
  if (requested && offers.some((offer) => offer.id === requested)) return requested;
  const activities = offers
    .filter((offer) => offer.productKind === "activity" && !offer.supplierPayeeEmail)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id));
  return activities[0]?.id;
}

/**
 * Demo-only: route one non-flight offer to a sandbox PayPal account as an
 * Onboarded Supplier. In production the payee comes from a supplier registry
 * on the server, never from the request.
 */
export function withDemoPayee(
  offers: readonly TravelOffer[],
  payee: { offerId: string; email: string },
): TravelOffer[] {
  const target = offers.find((offer) => offer.id === payee.offerId);
  if (!target) throw new Error("That offer is not part of this plan.");
  if (target.productKind === "flight") throw new Error("A flight cannot have a direct supplier payee.");
  return offers.map((offer) => (offer.id === payee.offerId ? { ...offer, supplierPayeeEmail: payee.email } : offer));
}

/** Idempotency keys for PayPal, one per money movement on a quote. */
export const requestIds = {
  order: (quoteId: string) => `tw-order-${quoteId}`,
  capture: (quoteId: string) => `tw-capture-${quoteId}`,
  refund: (quoteId: string, offerId: string) => `tw-refund-${quoteId}-${offerId}`.slice(0, 108),
};
