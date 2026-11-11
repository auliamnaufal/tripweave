import { z } from "zod";
import { runRebookAgent } from "@/features/agent/rebookAgent";
import { createKitCache } from "@/features/gear/gearCache";
import { parseTripBrief } from "@/features/planner/tripBrief";
import { canAccess } from "@/features/quotes/quote";
import { getQuoteByOrderId, getQuoteSnapshot, listBookings } from "@/features/quotes/quoteStore";
import { acceptedPicks, freedActivities, replacementCandidates } from "@/features/rebook/rebook";
import type { RebookResponse } from "@/features/rebook/types";
import { platformInfo } from "@/features/suppliers/platforms";
import { authedUser } from "@/lib/supabase/authedUser";

export const runtime = "nodejs";

const rebookRequestSchema = z.object({ orderId: z.string().trim().min(1).max(64) });

const PAID_STATUSES = new Set(["completed", "capturing", "needs_attention"]);

// One agent run per paid order and set of freed activities: a reload or a
// second tab shows the same suggestions without another model call.
const answers = createKitCache<RebookResponse>();

/**
 * Replacement suggestions for the activities a paid trip couldn't book. The
 * candidates come from the quote's own search snapshot, the rebooking agent
 * picks among them, and every pick is checked again here. Nothing is booked
 * or charged: the timeline shows them as suggestions.
 */
export async function POST(request: Request) {
  let input: z.infer<typeof rebookRequestSchema>;
  try {
    input = rebookRequestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const { user } = await authedUser();
    const quote = await getQuoteByOrderId(input.orderId).catch(() => null);
    if (!quote || !canAccess(quote, user?.id)) return Response.json({ error: "This trip was not found." }, { status: 404 });
    if (!PAID_STATUSES.has(quote.status)) return Response.json({ error: "This trip hasn't been paid yet." }, { status: 409 });

    const freed = freedActivities(quote.offers, await listBookings(quote.id));
    if (freed.length === 0) return Response.json({ suggestions: [], note: "Every activity on this trip was booked." } satisfies RebookResponse);

    const snapshot = await getQuoteSnapshot(quote.id);
    if (!snapshot) return Response.json({ error: "This trip's search has expired, so there's nothing to suggest from." }, { status: 409 });
    if (!process.env.OPENAI_API_KEY) return Response.json({ error: "The rebooking agent isn't configured." }, { status: 503 });

    const brief = parseTripBrief(quote.brief);
    const freedIds = new Set(freed.map((item) => item.offer.id));
    const candidatesByFreed = new Map(
      freed.map((item) => [
        item.offer.id,
        replacementCandidates({ freed: item, tripOffers: quote.offers, freedIds, catalog: snapshot.catalog, travelWindow: brief.travelWindow }),
      ]),
    );
    if ([...candidatesByFreed.values()].every((list) => list.length === 0)) {
      return Response.json({ suggestions: [], note: "Nothing else from this search fits those times within the refund." } satisfies RebookResponse);
    }

    const key = `${input.orderId}:${[...freedIds].sort().join(",")}`;
    const answer = await answers.get(key, async () => {
      const output = await runRebookAgent({ freed, candidatesByFreed, preferences: brief.preferences });
      const byId = new Map(freed.map((item) => [item.offer.id, item]));
      return {
        note: output.note,
        suggestions: acceptedPicks(output.suggestions, candidatesByFreed).map(({ pick, offer }) => {
          const hole = byId.get(pick.forOfferId)!;
          return {
            forOfferId: pick.forOfferId,
            forTitle: hole.offer.title,
            refundMinorUnits: hole.refundMinorUnits,
            reason: pick.reason,
            offer: {
              id: offer.id,
              title: offer.title,
              summary: offer.summary,
              startsAt: offer.startsAt,
              endsAt: offer.endsAt,
              costMinorUnits: offer.costMinorUnits,
              platform: platformInfo(offer.supplier).label,
              synthetic: offer.synthetic,
            },
          };
        }),
      };
    });
    return Response.json(answer);
  } catch (error) {
    console.error("rebook suggestions failed", error);
    return Response.json({ error: "The rebooking agent couldn't answer right now." }, { status: 503 });
  }
}
