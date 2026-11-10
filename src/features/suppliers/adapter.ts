import type { TripBrief } from "@/features/planner/tripBrief";
import type { TravelOffer } from "@/features/planner/travelOffer";
import type { BookingResult } from "./booking";

export type ProductKind = TravelOffer["productKind"];

/**
 * Re-checking one offer right before payment:
 * - unchanged: same price, still bookable (expiry may be refreshed)
 * - changed:   still bookable, but at a different price
 * - unavailable: gone, or the supplier no longer honors it
 */
export type RepriceResult =
  | { status: "unchanged"; offer: TravelOffer }
  | { status: "changed"; offer: TravelOffer; previousMinorUnits: number }
  | { status: "unavailable"; reason: string };

export type BookingContext = {
  /**
   * Stable per (quote, offer). A supplier that supports idempotency must
   * receive it, so a retried booking can never create a second reservation.
   */
  idempotencyKey: string;
  /** DEMO_MODE only: make this booking fail on purpose. */
  forceFail?: boolean;
};

/**
 * The one contract every travel supplier is wired through. Everything above
 * this line (planner, quotes, payments, booking) only ever sees TravelOffer.
 *
 * Rules every adapter follows:
 * - `name` equals the `supplier` field of every offer it returns, so an offer
 *   can always be routed back to the adapter that made it.
 * - Prices are converted to USD minor units here, at the boundary.
 * - Offer ids are prefixed by product kind and unique within one search.
 * - `synthetic` is true unless the data came from the supplier's live API.
 * - Errors never leak raw supplier payloads; throw a short message instead.
 */
export interface SupplierAdapter {
  readonly name: string;
  readonly kinds: readonly ProductKind[];
  /**
   * - bookable: Tripweave can reprice and book it with its own credentials, so
   *   it may go into a quote and the single PayPal payment.
   * - deeplink: price information only (affiliate / metasearch feeds). Shown
   *   as "cheaper on X" with its `listingUrl`, never charged through PayPal.
   */
  readonly capability: "bookable" | "deeplink";
  /** False when credentials are missing; the registry skips it instead of failing. */
  isConfigured(): boolean;
  search(brief: TripBrief, kind: ProductKind): Promise<TravelOffer[]>;
  reprice(offer: TravelOffer): Promise<RepriceResult>;
  book(offer: TravelOffer, context: BookingContext): Promise<BookingResult>;
}
