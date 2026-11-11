import { canAccess } from "@/features/quotes/quote";
import { getQuoteByOrderId, listBookings } from "@/features/quotes/quoteStore";
import { platformInfo } from "@/features/suppliers/platforms";
import type { TicketItem, TicketsResponse } from "./types";

export type TicketsLookup =
  | { ok: true; tickets: TicketsResponse }
  | { ok: false; status: 404 | 409; error: string };

const PAID_STATUSES = new Set(["completed", "capturing", "needs_attention"]);

/**
 * Tickets for a paid trip, read from what was actually stored at capture
 * (bookings rows), so they survive reloads and other devices. Same access
 * rule as payment: the quote's owner, or whoever holds a guest order id.
 * Shared by the JSON and PDF ticket routes so both enforce one rule.
 */
export async function loadTickets(orderId: string, userId: string | null | undefined): Promise<TicketsLookup> {
  const quote = await getQuoteByOrderId(orderId).catch(() => null);
  if (!quote || !canAccess(quote, userId)) return { ok: false, status: 404, error: "This trip was not found." };
  if (!PAID_STATUSES.has(quote.status)) return { ok: false, status: 409, error: "This trip hasn't been paid yet." };

  const bookings = new Map((await listBookings(quote.id)).map((booking) => [booking.offerId, booking]));
  const items: TicketItem[] = quote.offers.map((offer) => {
    const booking = bookings.get(offer.id);
    const info = platformInfo(offer.supplier);
    return {
      offerId: offer.id,
      kind: offer.productKind,
      title: offer.title,
      summary: offer.summary,
      startsAt: offer.startsAt,
      endsAt: offer.endsAt,
      costMinorUnits: offer.costMinorUnits,
      platform: { supplier: offer.supplier, label: info.label, data: info.data },
      status: booking?.status ?? "pending",
      bookingRef: booking?.bookingRef ?? null,
      failureReason: booking?.failureReason ?? null,
      refunded: Boolean(booking?.refundStatus),
      cancellationTerms: offer.cancellationTerms,
      qr: ["TRIPWEAVE", orderId, offer.id, booking?.bookingRef ?? "PENDING"].join("|"),
    };
  });

  return {
    ok: true,
    tickets: {
      orderId,
      status: quote.status,
      paidMinorUnits: quote.totalMinorUnits,
      travellers: (quote.travellers ?? []).map(({ firstName, lastName }) => ({ firstName, lastName })),
      items: items.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    },
  };
}
