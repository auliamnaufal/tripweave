import { buildItinerary } from "@/features/planner/planner";
import type { TripBrief } from "@/features/planner/tripBrief";
import { itineraryPlanSchema, type ItineraryPlanView, type TravelOffer } from "@/features/planner/travelOffer";
import { alternativesFor, type AlternativeSlot } from "@/features/suppliers/alternatives";
import { comparisonsFor, type MarketBenchmark, type ProductComparison } from "@/features/suppliers/compare";
import { summarizeDeal, type DealSummary } from "@/features/suppliers/deal";
import type { SourceReport } from "@/features/suppliers/registry";
import { saveQuote } from "./quoteStore";

/** What a search found besides the catalog itself; saved with the quote so a swap can recompute the deal. */
export type PlanInsights = { comparisons: ProductComparison[]; markets: MarketBenchmark[]; sources: SourceReport[] };

export type PlanResult = {
  plan: ItineraryPlanView;
  note: string;
  source: string;
  sources: SourceReport[];
  comparisons: ProductComparison[];
  deal: DealSummary;
  /** Other options for each flight leg and stay, from the same search, for instant swaps. */
  alternatives: AlternativeSlot[];
  retrievedAt: string;
  quoteId?: string;
};

/**
 * Turns a selection into everything the planner shows: the deterministic
 * itinerary, the deal summary, the swap options, and a saved quote (with the
 * catalog snapshot) that checkout pays. Used by /api/plan and /api/plan/swap.
 */
export async function finalizePlan(input: {
  userId: string | null;
  brief: TripBrief;
  selection: readonly TravelOffer[];
  catalog: readonly TravelOffer[];
  insights: PlanInsights;
  note: string;
}): Promise<PlanResult> {
  const plan = buildItinerary(input.brief, [...input.selection]);
  let quoteId: string | undefined;
  try {
    quoteId = await saveQuote({ userId: input.userId, brief: input.brief, offers: plan.offers, catalog: input.catalog, insights: input.insights });
  } catch (error) {
    console.error("plan quote save failed", error);
  }
  const { comparisons, markets, sources } = input.insights;
  return {
    plan: itineraryPlanSchema.parse(plan),
    note: input.note,
    source: [...new Set(plan.offers.map((offer) => offer.supplier))].join("+"),
    sources,
    comparisons: comparisonsFor(plan.offers, comparisons),
    deal: summarizeDeal(plan.offers, comparisons, markets, sources),
    alternatives: alternativesFor(plan.offers, input.catalog),
    retrievedAt: new Date().toISOString(),
    ...(quoteId ? { quoteId } : {}),
  };
}
