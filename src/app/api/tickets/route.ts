import { z } from "zod";
import { loadTickets } from "@/features/tickets/loadTickets";
import { authedUser } from "@/lib/supabase/authedUser";

export const runtime = "nodejs";

export type { TicketItem, TicketsResponse } from "@/features/tickets/types";

const ticketsQuerySchema = z.object({ orderId: z.string().trim().min(1).max(64) });

/**
 * E-tickets for a paid trip, read from what was actually stored at capture
 * (bookings rows). Access and paid-status rules live in `loadTickets`.
 */
export async function GET(request: Request) {
  let input: z.infer<typeof ticketsQuerySchema>;
  try {
    input = ticketsQuerySchema.parse({ orderId: new URL(request.url).searchParams.get("orderId") ?? undefined });
  } catch {
    return Response.json({ error: "Missing order." }, { status: 400 });
  }

  const { user } = await authedUser();
  const result = await loadTickets(input.orderId, user?.id);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result.tickets);
}
