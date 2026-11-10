import { briefProblem, parseTripBrief } from "@/features/planner/tripBrief";
import { buildItinerary, selectOffers } from "@/features/planner/planner";
import { CatalogUnavailableError, searchCatalog, type SourceReport } from "@/features/suppliers/registry";
import { comparisonsFor, type ProductComparison } from "@/features/suppliers/compare";
import { streamPlannerAgent, type PlannerStreamEvent } from "@/features/agent/plannerAgent";
import { itineraryPlanSchema, type ItineraryPlanView } from "@/features/planner/travelOffer";
import { saveQuote } from "@/features/quotes/quoteStore";
import { authedUser } from "@/lib/supabase/authedUser";

export const runtime = "nodejs";

export type PlanStreamEvent =
  | PlannerStreamEvent
  | {
      kind: "plan";
      plan: ItineraryPlanView;
      note: string;
      source: string;
      /** Per supplier and kind: whether it answered, timed out, failed or was a fallback. */
      sources: SourceReport[];
      /** For the plan's own products: every platform's price, cheapest first. */
      comparisons: ProductComparison[];
      retrievedAt: string;
      // The server-held priced snapshot of this plan. Checkout pays this id,
      // never the offers the browser holds. Absent only if it could not be saved,
      // in which case the plan can be viewed but not paid.
      quoteId?: string;
    }
  | { kind: "error"; message: string };

function ndjsonLine(event: PlanStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export async function POST(request: Request) {
  let body: unknown;
  let brief;
  try {
    body = await request.json();
    brief = parseTripBrief(body);
  } catch {
    // `reason` is the schema's own human-readable message (e.g. "At most 9
    // travellers per trip."), so the planner can say what to change.
    return Response.json({ error: "The trip brief is invalid.", reason: body === undefined ? undefined : briefProblem(body) }, { status: 400 });
  }

  // Read once, outside the stream, since it needs the request's cookies.
  const { user } = await authedUser();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // One search, shared: the agent picks from this catalog and the plan is
        // rebuilt from it, so ids and prices can't drift between the two.
        const { offers: catalog, comparisons, sources } = await searchCatalog(brief);

        const agentSteps = streamPlannerAgent(brief, catalog);
        let step = await agentSteps.next();
        while (!step.done) {
          controller.enqueue(ndjsonLine(step.value));
          step = await agentSteps.next();
        }

        const plan = buildItinerary(brief, selectOffers(catalog, step.value.offerIds));

        let quoteId: string | undefined;
        try {
          quoteId = await saveQuote({ userId: user?.id ?? null, brief, offers: plan.offers });
        } catch (error) {
          console.error("plan quote save failed", error);
        }

        controller.enqueue(
          ndjsonLine({
            kind: "plan",
            plan: itineraryPlanSchema.parse(plan),
            note: step.value.note,
            source: [...new Set(plan.offers.map((offer) => offer.supplier))].join("+"),
            sources,
            comparisons: comparisonsFor(plan.offers, comparisons),
            retrievedAt: new Date().toISOString(),
            ...(quoteId ? { quoteId } : {}),
          }),
        );
      } catch (error) {
        console.error("plan generation failed", error);
        const message =
          error instanceof CatalogUnavailableError
            ? `${error.message} Try other dates or another destination.`
            : "The planner is unavailable. Please try again.";
        controller.enqueue(ndjsonLine({ kind: "error", message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
