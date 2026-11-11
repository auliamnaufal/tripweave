import { z } from "zod";
import { loadTickets } from "@/features/tickets/loadTickets";
import { buildTicketsPdf, pdfFileRef, ticketableItems } from "@/features/tickets/ticketPdf";
import { authedUser } from "@/lib/supabase/authedUser";

export const runtime = "nodejs";

const pdfQuerySchema = z.object({
  orderId: z.string().trim().min(1).max(64),
  offerId: z.string().trim().min(1).max(200).optional(),
});

/**
 * Printable trip documents (e-ticket, hotel voucher, activity ticket) as one
 * PDF, a page per booked item, or just `offerId`'s. Same access and paid-status
 * rules as the JSON tickets route. Every page carries a sandbox mark: the
 * supplier bookings behind them are simulated.
 */
export async function GET(request: Request) {
  let input: z.infer<typeof pdfQuerySchema>;
  try {
    const params = new URL(request.url).searchParams;
    input = pdfQuerySchema.parse({
      orderId: params.get("orderId") ?? undefined,
      offerId: params.get("offerId") ?? undefined,
    });
  } catch {
    return Response.json({ error: "Missing or invalid order." }, { status: 400 });
  }

  const { user } = await authedUser();
  const result = await loadTickets(input.orderId, user?.id);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  const { tickets } = result;

  if (input.offerId && !tickets.items.some((item) => item.offerId === input.offerId)) {
    return Response.json({ error: "That item isn't part of this trip." }, { status: 404 });
  }
  const items = ticketableItems(tickets, input.offerId);
  if (items.length === 0) {
    return Response.json(
      { error: input.offerId ? "This item wasn't booked, so it has no ticket." : "Nothing on this trip is booked yet, so there are no tickets." },
      { status: 409 },
    );
  }

  const bytes = await buildTicketsPdf(tickets, { offerId: input.offerId });
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="tripweave-${pdfFileRef(tickets, items)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
