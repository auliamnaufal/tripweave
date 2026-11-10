import type { BookingRecord, PlanQuote, QuoteStatus } from "@/features/quotes/quote";

/** The part of a PayPal webhook event this app reads. */
export type PayPalWebhookEvent = {
  id: string;
  event_type: string;
  resource?: { id?: string; custom_id?: string; status?: string };
};

export type WebhookDeps = {
  getQuote(id: string): Promise<PlanQuote | null>;
  listBookings(quoteId: string): Promise<BookingRecord[]>;
  transitionQuote(id: string, from: QuoteStatus, to: QuoteStatus): Promise<boolean>;
  setQuoteStatus(id: string, status: QuoteStatus): Promise<void>;
};

export type WebhookOutcome = { outcome: string; quoteId: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What a verified, first-time PayPal event changes. Webhooks are the safety
 * net, not the main path: /api/payments/capture handles the normal case, and
 * this only acts where the browser can't — money that cleared later, or money
 * that was taken back.
 *
 * - CAPTURE.COMPLETED on a quote held as needs_attention with nothing booked
 *   yet (a capture that was PENDING): release it so capture can run again
 *   and book. Anything already booked is left for a human.
 * - CAPTURE.DENIED / DECLINED / REVERSED: money didn't arrive or was pulled
 *   back, so flag the quote for a human.
 * - Everything else is recorded only.
 */
export async function handlePayPalEvent(event: PayPalWebhookEvent, deps: WebhookDeps): Promise<WebhookOutcome> {
  const customId = event.resource?.custom_id;
  const quote = customId && UUID.test(customId) ? await deps.getQuote(customId) : null;
  const quoteId = quote?.id ?? null;
  if (!event.event_type.startsWith("PAYMENT.CAPTURE.")) return { outcome: "ignored", quoteId };
  if (!quote) return { outcome: "no-matching-quote", quoteId };

  switch (event.event_type) {
    case "PAYMENT.CAPTURE.COMPLETED": {
      if (quote.status !== "needs_attention") return { outcome: "noted", quoteId };
      const bookings = await deps.listBookings(quote.id);
      if (bookings.some((booking) => booking.status !== "pending" && booking.status !== "paid_direct")) {
        return { outcome: "left-for-review", quoteId };
      }
      const released = await deps.transitionQuote(quote.id, "needs_attention", "ordered");
      return { outcome: released ? "released-for-booking" : "noted", quoteId };
    }
    case "PAYMENT.CAPTURE.DENIED":
    case "PAYMENT.CAPTURE.DECLINED":
    case "PAYMENT.CAPTURE.REVERSED":
      await deps.setQuoteStatus(quote.id, "needs_attention");
      return { outcome: "flagged", quoteId };
    default:
      return { outcome: "noted", quoteId };
  }
}
