import { parseTripBrief } from "@/features/planner/tripBrief";
import { buildItinerary, selectOffers } from "@/features/planner/planner";
import { searchAllOffers } from "@/features/suppliers/duffel";
import { streamPlannerAgent, type PlannerStreamEvent } from "@/features/agent/plannerAgent";
import { itineraryPlanSchema, type ItineraryPlanView } from "@/features/planner/travelOffer";

export const runtime = "nodejs";

export type PlanStreamEvent =
  | PlannerStreamEvent
  | { kind: "plan"; plan: ItineraryPlanView; note: string; source: string; retrievedAt: string }
  | { kind: "error"; message: string };

function ndjsonLine(event: PlanStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export async function POST(request: Request) {
  let brief;
  try {
    brief = parseTripBrief(await request.json());
  } catch {
    return Response.json({ error: "The trip brief is invalid." }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const agentSteps = streamPlannerAgent(brief);
        let step = await agentSteps.next();
        while (!step.done) {
          controller.enqueue(ndjsonLine(step.value));
          step = await agentSteps.next();
        }

        const catalog = await searchAllOffers(brief);
        const plan = buildItinerary(brief, selectOffers(catalog, step.value.offerIds));
        controller.enqueue(
          ndjsonLine({
            kind: "plan",
            plan: itineraryPlanSchema.parse(plan),
            note: step.value.note,
            source: "duffel+synthetic",
            retrievedAt: new Date().toISOString(),
          }),
        );
      } catch (error) {
        console.error("plan generation failed", error);
        controller.enqueue(
          ndjsonLine({ kind: "error", message: "The planner is unavailable. Please try again." }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
