import { canAccess } from "@/features/quotes/quote";
import { getQuoteByOrderId, listBookings } from "@/features/quotes/quoteStore";
import { platformInfo } from "@/features/suppliers/platforms";
import { authedUser } from "@/lib/supabase/authedUser";

export const runtime = "nodejs";

export type TicketItem = {
  offerId: string;
  kind: "flight" | "hotel" | "activity";
  title: string;
  summary: string;
  startsAt: string;
  endsAt: string;
  costMinorUnits: number;
  platform: { supplier: string; label: string; data: "live" | "simulated" };
  status: "booked" | "failed" | "paid_direct" | "pending";
  bookingRef: string | null;
  failureReason: string | null;
  refunded: boolean;
  /** What the ticket's QR encodes: references only, never personal data. */
  qr: string;
};

export type TicketsResponse = {
  orderId: string;
  status: string;
  paidMinorUnits: number;
  travellers: { firstName: string; lastName: string }[];
  items: TicketItem[];
};

/**
 * E-tickets for a paid trip, read from what was actually stored at capture
 * (bookings rows), so they survive reloads and other devices. Same access
 * rule as payment: the quote's owner, or whoever holds a guest order id.
 */
export async function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get("orderId");
  if (!orderId) return Response.json({ error: "Missing order." }, { status: 400 });

  const { user } = await authedUser();
  const quote = await getQuoteByOrderId(orderId).catch(() => null);
  if (!quote || !canAccess(quote, user?.id)) return Response.json({ error: "This trip was not found." }, { status: 404 });
  if (quote.status !== "completed" && quote.status !== "capturing" && quote.status !== "needs_attention") {
    return Response.json({ error: "This trip hasn't been paid yet." }, { status: 409 });
  }

  const bookings = new Map((await listBookings(quote.id)).map((booking) => [booking.offerId, booking]));
  const items: TicketItem[] = quote.offers.map((offer) => {
    const booking = bookings.get(offer.id);
    const status = booking?.status ?? "pending";
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
      status,
      bookingRef: booking?.bookingRef ?? null,
      failureReason: booking?.failureReason ?? null,
      refunded: Boolean(booking?.refundStatus),
      qr: ["TRIPWEAVE", orderId, offer.id, booking?.bookingRef ?? "PENDING"].join("|"),
    };
  });

  const body: TicketsResponse = {
    orderId,
    status: quote.status,
    paidMinorUnits: quote.totalMinorUnits,
    travellers: (quote.travellers ?? []).map(({ firstName, lastName }) => ({ firstName, lastName })),
    items: items.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
  };
  return Response.json(body);
}
