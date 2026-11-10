import type { TravelOffer } from "@/features/planner/travelOffer";
import type { ProductKind } from "./adapter";
import type { BookingResult } from "./booking";
import { bookOffer as registryBook } from "./registry";

export type BookingToolName = "book_flight" | "book_hotel" | "book_activity";

/** Same event shape the booking agent streamed, so /booked and /lab render it unchanged. */
export type BookingStreamEvent =
  | { kind: "tool-call"; tool: BookingToolName; label: string }
  | { kind: "tool-result"; tool: BookingToolName; summary: string }
  | { kind: "note"; text: string };

export type BookingRunOutput = { results: BookingResult[]; note: string };

const TOOL_FOR_KIND: Record<ProductKind, BookingToolName> = {
  flight: "book_flight",
  hotel: "book_hotel",
  activity: "book_activity",
};

const LABEL_FOR_KIND: Record<ProductKind, string> = {
  flight: "Booking flight…",
  hotel: "Booking hotel…",
  activity: "Booking activity…",
};

// Flights first: they are the scarcest inventory and the hardest to replace.
const KIND_ORDER: Record<ProductKind, number> = { flight: 0, hotel: 1, activity: 2 };

export type BookingRunOptions = {
  /** Prefix for each booking's idempotency key: `${keyPrefix}:${offer.id}`. */
  keyPrefix: string;
  forceFailureOfferId?: string;
  book?: (offer: TravelOffer, context: { idempotencyKey: string; forceFail?: boolean }) => Promise<BookingResult>;
};

/** An adapter's answer, checked: it must be about this offer and be a well-formed result. */
function acceptResult(offer: TravelOffer, result: BookingResult): BookingResult {
  if (result.offerId !== offer.id) throw new Error(`Supplier answered for ${result.offerId}, expected ${offer.id}.`);
  if (result.status === "booked" && !result.bookingRef) throw new Error("Supplier confirmed a booking without a reference.");
  return result;
}

/**
 * Books every paid offer through its own supplier adapter, one at a time.
 * Outcomes are recorded by this code from what each supplier actually
 * answered — never from a model's summary — and one failure never stops the
 * rest. Every offer gets exactly one result, which `reconcileBookings` relies on.
 */
export async function* runBookings(
  offers: readonly TravelOffer[],
  options: BookingRunOptions,
): AsyncGenerator<BookingStreamEvent, BookingRunOutput> {
  const book = options.book ?? registryBook;
  const ordered = [...offers].sort((a, b) => KIND_ORDER[a.productKind] - KIND_ORDER[b.productKind]);
  const results: BookingResult[] = [];

  for (const offer of ordered) {
    const tool = TOOL_FOR_KIND[offer.productKind];
    yield { kind: "tool-call", tool, label: LABEL_FOR_KIND[offer.productKind] };
    let result: BookingResult;
    try {
      result = acceptResult(
        offer,
        await book(offer, {
          idempotencyKey: `${options.keyPrefix}:${offer.id}`,
          forceFail: offer.id === options.forceFailureOfferId,
        }),
      );
    } catch (error) {
      console.error(`booking ${offer.id} via ${offer.supplier} failed`, error);
      result = { offerId: offer.id, status: "failed", reason: "The supplier could not confirm this booking." };
    }
    results.push(result);
    yield { kind: "tool-result", tool, summary: result.status === "booked" ? "Booked." : `Failed: ${result.reason}` };
  }

  const failed = results.filter((result) => result.status === "failed").length;
  const note =
    failed === 0
      ? `All ${results.length} item${results.length === 1 ? "" : "s"} booked.`
      : `${results.length - failed} of ${results.length} booked. ${failed} could not be booked and will be refunded.`;
  return { results, note };
}
