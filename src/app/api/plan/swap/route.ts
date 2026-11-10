import { z } from "zod";
import { parseTripBrief } from "@/features/planner/tripBrief";
import { canAccess } from "@/features/quotes/quote";
import { getQuote, getQuoteSnapshot } from "@/features/quotes/quoteStore";
import { finalizePlan, type PlanInsights, type PlanResult } from "@/features/quotes/planResult";
import { swapOffer } from "@/features/suppliers/alternatives";
import { platformInfo } from "@/features/suppliers/platforms";
import { authedUser } from "@/lib/supabase/authedUser";

export const runtime = "nodejs";

const swapRequestSchema = z.object({
  quoteId: z.string().uuid(),
  fromOfferId: z.string().min(1).max(200),
  toOfferId: z.string().min(1).max(200),
});

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * Swaps one flight or stay for another option from the same search. No new
 * search and no agent call: the plan is rebuilt from the catalog snapshot
 * saved with the quote, at the prices that search found, so it's instant.
 * Prices are still re-checked with the supplier at checkout, as always.
 */
export async function POST(request: Request) {
  let input: z.infer<typeof swapRequestSchema>;
  try {
    input = swapRequestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid swap request." }, { status: 400 });
  }

  try {
    const { user } = await authedUser();
    const quote = await getQuote(input.quoteId);
    if (!quote || !canAccess(quote, user?.id)) return Response.json({ error: "This plan was not found." }, { status: 404 });
    if (quote.status !== "quoted") return Response.json({ error: "This plan is already being paid, so it can't change." }, { status: 409 });
    const snapshot = await getQuoteSnapshot(quote.id);
    if (!snapshot) return Response.json({ error: "This plan's search has expired. Plan it again to change options." }, { status: 409 });

    const swapped = swapOffer(quote.offers, snapshot.catalog, input.fromOfferId, input.toOfferId);
    if ("error" in swapped) return Response.json({ error: swapped.error }, { status: 409 });

    const from = quote.offers.find((offer) => offer.id === input.fromOfferId)!;
    const to = snapshot.catalog.find((offer) => offer.id === input.toOfferId)!;
    const difference = to.costMinorUnits - from.costMinorUnits;
    const insights = (snapshot.insights ?? { comparisons: [], markets: [], sources: [] }) as PlanInsights;

    const result: PlanResult = await finalizePlan({
      userId: quote.userId,
      brief: parseTripBrief(quote.brief),
      selection: swapped.offers,
      catalog: snapshot.catalog,
      insights,
      note: `Switched to ${to.title} via ${platformInfo(to.supplier).label} (${difference === 0 ? "same price" : `${money.format(Math.abs(difference) / 100)} ${difference < 0 ? "less" : "more"}`}).`,
    });
    return Response.json({ kind: "plan", ...result, differenceMinorUnits: difference });
  } catch (error) {
    console.error("swap failed", error);
    return Response.json({ error: "Couldn't change that option right now." }, { status: 503 });
  }
}
