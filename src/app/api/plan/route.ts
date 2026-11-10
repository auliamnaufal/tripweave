import { briefProblem, parseTripBrief } from "@/features/planner/tripBrief";
import { selectOffers } from "@/features/planner/planner";
import { CatalogUnavailableError, searchCatalog } from "@/features/suppliers/registry";
import { streamPlannerAgent, type PlannerStreamEvent } from "@/features/agent/plannerAgent";
import { finalizePlan, type PlanResult } from "@/features/quotes/planResult";
import { authedUser } from "@/lib/supabase/authedUser";

export const runtime = "nodejs";

export type PlanStreamEvent =
  | PlannerStreamEvent
  | ({ kind: "plan" } & PlanResult)
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
        const { offers: catalog, comparisons, markets, sources } = await searchCatalog(brief);

        const agentSteps = streamPlannerAgent(brief, catalog, { insights: { comparisons, markets } });
        let step = await agentSteps.next();
        while (!step.done) {
          controller.enqueue(ndjsonLine(step.value));
          step = await agentSteps.next();
        }

        const result = await finalizePlan({
          userId: user?.id ?? null,
          brief,
          selection: selectOffers(catalog, step.value.offerIds),
          catalog,
          insights: { comparisons, markets, sources },
          note: step.value.note,
        });
        controller.enqueue(ndjsonLine({ kind: "plan", ...result }));
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
