import { z } from "zod";
import { buildItinerary } from "@/features/planner/planner";
import { parseTripBrief } from "@/features/planner/tripBrief";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { canAccess, type QuoteStatus } from "@/features/quotes/quote";
import { getQuote, getQuoteSnapshot } from "@/features/quotes/quoteStore";
import { finalizePlan, type PlanInsights, type PlanResult } from "@/features/quotes/planResult";
import { checkEdit } from "@/features/suppliers/alternatives";
import { authedUser } from "@/lib/supabase/authedUser";

export const runtime = "nodejs";

const editRequestSchema = z.object({
  quoteId: z.string().uuid(),
  /** The whole selection the traveller wants: every flight leg, stay and activity. */
  offerIds: z.array(z.string().min(1).max(200)).min(1).max(40),
});

/**
 * A plan can change until it's paid: while it's only quoted, or ordered with
 * PayPal but not approved and captured yet. An edit never touches the old
 * quote (its PayPal-Request-Id is derived from its id); it saves a new one.
 */
const EDITABLE: readonly QuoteStatus[] = ["quoted", "ordered"];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * Applies an edit to a plan: swap a flight leg or stay for another option from
 * the same search, or add/remove activities. No new search and no agent run:
 * the plan is rebuilt from the catalog snapshot saved with the quote, by the
 * same deterministic code as every plan, so it's instant. Prices are still
 * re-checked with each supplier at checkout.
 */
export async function POST(request: Request) {
  let input: z.infer<typeof editRequestSchema>;
  try {
    input = editRequestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid edit request." }, { status: 400 });
  }

  try {
    const { user } = await authedUser();
    const quote = await getQuote(input.quoteId);
    if (!quote || !canAccess(quote, user?.id)) return Response.json({ error: "This plan was not found." }, { status: 404 });
    if (!EDITABLE.includes(quote.status)) return Response.json({ error: "This plan is already paid, so it can't change." }, { status: 409 });
    const snapshot = await getQuoteSnapshot(quote.id);
    if (!snapshot) return Response.json({ error: "This plan's search has expired. Plan it again to change options." }, { status: 409 });

    const known = new Map<string, TravelOffer>([...snapshot.catalog, ...quote.offers].map((offer) => [offer.id, offer]));
    const next: TravelOffer[] = [];
    for (const id of input.offerIds) {
      const offer = known.get(id);
      if (!offer) return Response.json({ error: "That option is no longer in this search." }, { status: 409 });
      next.push(offer);
    }
    const shapeProblem = checkEdit(quote.offers, next);
    if (shapeProblem) return Response.json({ error: shapeProblem }, { status: 409 });

    const brief = parseTripBrief(quote.brief);
    // Going over budget is the traveller's call (the screen says so); a clash
    // or an item outside the trip dates is never payable.
    const blocking = buildItinerary(brief, next).violations.find((violation) => violation.kind !== "over-budget");
    if (blocking) {
      const message =
        blocking.kind === "schedule-conflict"
          ? `${known.get(blocking.secondOfferId)?.title ?? "That activity"} overlaps ${known.get(blocking.firstOfferId)?.title ?? "something else in the plan"}.`
          : "That option falls outside the trip dates.";
      return Response.json({ error: message }, { status: 409 });
    }

    const total = next.reduce((sum, offer) => sum + offer.costMinorUnits, 0);
    const result: PlanResult = await finalizePlan({
      userId: quote.userId,
      brief,
      selection: next,
      catalog: snapshot.catalog,
      insights: (snapshot.insights ?? { comparisons: [], markets: [], sources: [] }) as PlanInsights,
      note: `Updated by you. New total ${money.format(total / 100)}.`,
    });
    if (!result.quoteId) return Response.json({ error: "Couldn't save that change right now." }, { status: 503 });
    return Response.json({ kind: "plan", ...result });
  } catch (error) {
    console.error("plan edit failed", error);
    return Response.json({ error: "Couldn't change the plan right now." }, { status: 503 });
  }
}
