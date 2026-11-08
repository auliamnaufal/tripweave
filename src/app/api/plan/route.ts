import { parseTripBrief } from "@/features/planner/tripBrief";
import { buildItinerary, selectOffers } from "@/features/planner/planner";
import { searchAllOffers } from "@/features/suppliers/duffel";
import { runPlannerAgent } from "@/features/agent/plannerAgent";
import { itineraryPlanSchema } from "@/features/planner/travelOffer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let brief;
  try {
    brief = parseTripBrief(await request.json());
  } catch {
    return Response.json({ error: "The trip brief is invalid." }, { status: 400 });
  }

  try {
    const output = await runPlannerAgent(brief);
    const catalog = await searchAllOffers(brief);
    const plan = buildItinerary(brief, selectOffers(catalog, output.offerIds));
    return Response.json({
      plan: itineraryPlanSchema.parse(plan),
      note: output.note,
      source: "duffel+synthetic",
      retrievedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("plan generation failed", error);
    return Response.json(
      { error: "The planner is unavailable. Please try again." },
      { status: 503 },
    );
  }
}
