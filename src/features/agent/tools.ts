import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { buildItinerary, selectOffers } from "@/features/planner/planner";
import type { TripBrief } from "@/features/planner/tripBrief";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { bookOffer as registryBook } from "@/features/suppliers/registry";
import type { MarketBenchmark, ProductComparison } from "@/features/suppliers/compare";
import { platformInfo } from "@/features/suppliers/platforms";

const usd = (minor: number) => Math.round(minor) / 100;

/** What the model sees of an offer: enough to choose, none of the supplier's internal references. */
function agentView(offer: TravelOffer) {
  const platform = platformInfo(offer.supplier);
  return {
    id: offer.id,
    platform: platform.label,
    ...(platform.data === "simulated" ? { simulatedPartner: true } : {}),
    title: offer.title,
    summary: offer.summary,
    startsAt: offer.startsAt,
    endsAt: offer.endsAt,
    priceUsd: usd(offer.costMinorUnits),
    cancellation: offer.cancellationTerms,
  };
}

export type DealInsights = { comparisons: readonly ProductComparison[]; markets: readonly MarketBenchmark[] };

/**
 * The planner's tools read from one catalog the caller already searched
 * (`searchCatalog`) across every partner platform. The agent never triggers a
 * supplier call itself, and the server rebuilds the final plan from this same
 * catalog. Each product appears once, at the platform with its cheapest
 * bookable price; `compare_platforms` shows what the others asked.
 */
export function makePlannerTools(brief: TripBrief, catalog: readonly TravelOffer[], insights: DealInsights = { comparisons: [], markets: [] }) {
  const flights = catalog.filter((offer) => offer.productKind === "flight");
  const hotels = catalog.filter((offer) => offer.productKind === "hotel");
  const activities = catalog.filter((offer) => offer.productKind === "activity");
  const byId = new Map(catalog.map((offer) => [offer.id, offer]));
  const comparisonByKey = new Map(insights.comparisons.map((comparison) => [comparison.productKey, comparison]));

  const searchFlightsTool = tool(
    async () => JSON.stringify(flights.map(agentView)),
    {
      name: "search_flights",
      description: "Return bookable flight offers from every partner platform, each product at its cheapest platform.",
      schema: z.object({}),
    },
  );

  const searchHotelsTool = tool(
    async () => JSON.stringify(hotels.map(agentView)),
    {
      name: "search_hotels",
      description: "Return bookable hotel offers from every partner platform, each room at its cheapest platform.",
      schema: z.object({}),
    },
  );

  const searchActivitiesTool = tool(
    async () => JSON.stringify(activities.map(agentView)),
    {
      name: "search_activities",
      description: "Return bookable activity offers from every partner platform.",
      schema: z.object({}),
    },
  );

  const comparePlatformsTool = tool(
    async ({ offerIds }: { offerIds: string[] }) =>
      JSON.stringify(
        offerIds.slice(0, 12).map((id) => {
          const offer = byId.get(id);
          if (!offer) return { offerId: id, error: "Unknown offer id." };
          const comparison = offer.productKey ? comparisonByKey.get(offer.productKey) : undefined;
          if (!comparison) return { offerId: id, title: offer.title, onlyOn: platformInfo(offer.supplier).label };
          return {
            offerId: id,
            title: offer.title,
            prices: comparison.options.map((item) => ({
              platform: platformInfo(item.supplier).label,
              priceUsd: usd(item.costMinorUnits),
              bookableHere: item.bookable,
              terms: item.cancellationTerms,
            })),
          };
        }),
      ),
    {
      name: "compare_platforms",
      description:
        "For the given offer ids, list what every platform charges for that exact product, cheapest first, with each platform's terms (refundability, bags).",
      schema: z.object({ offerIds: z.array(z.string()).max(12) }),
    },
  );

  const checkMarketTool = tool(
    async () =>
      JSON.stringify(
        insights.markets.map((market) => ({
          route: market.route,
          date: market.date,
          bestBookableUsd: market.bestBookable ? usd(market.bestBookable.costMinorUnits) : null,
          bestBookablePlatform: market.bestBookable ? platformInfo(market.bestBookable.supplier).label : null,
          marketFareSameDayUsd: market.sameDay ? usd(market.sameDay.costMinorUnits) : null,
          cheapestNearbyDate: market.nearby ? { date: market.nearby.date, marketFareUsd: usd(market.nearby.costMinorUnits) } : null,
        })),
      ),
    {
      name: "check_market",
      description:
        "Compare the trip's flight days with recent metasearch fares (Aviasales) on the same routes, including the cheapest day within a week. Market fares are a price check, not bookable here.",
      schema: z.object({}),
    },
  );

  const buildItineraryTool = tool(
    async ({ offerIds }: { offerIds: string[] }) => {
      const plan = buildItinerary(brief, selectOffers(catalog, offerIds));
      return JSON.stringify({
        offerIds: plan.offers.map((offer) => offer.id),
        totalCostMinorUnits: plan.totalCostMinorUnits,
        totalUsd: usd(plan.totalCostMinorUnits),
        status: plan.status,
        budgetRemainingUsd: plan.budgetRemainingMinorUnits === null ? null : usd(plan.budgetRemainingMinorUnits),
        violations: plan.violations,
      });
    },
    {
      name: "build_itinerary",
      description:
        "Build and evaluate an itinerary from selected offer ids. Returns the deterministic total and feasibility.",
      schema: z.object({ offerIds: z.array(z.string()) }),
    },
  );

  return {
    catalog,
    tools: [searchFlightsTool, searchHotelsTool, searchActivitiesTool, comparePlatformsTool, checkMarketTool, buildItineraryTool],
  };
}

/**
 * Tools for the post-payment booking agent. Each offer was already chosen and
 * paid for during planning; these tools only execute it, scoped so an id of
 * the wrong kind can't be booked under the wrong label.
 */
export function makeBookingTools(offers: readonly TravelOffer[], forceFailureOfferId?: string, keyPrefix = "agent") {
  const byId = new Map(offers.map((offer) => [offer.id, offer]));

  async function bookOffer(offerId: string, expectedKind: TravelOffer["productKind"]): Promise<string> {
    const offer = byId.get(offerId);
    if (!offer) return JSON.stringify({ offerId, status: "failed", reason: "Unknown offer id." });
    if (offer.productKind !== expectedKind) {
      return JSON.stringify({
        offerId,
        status: "failed",
        reason: `Expected a ${expectedKind}, got a ${offer.productKind}.`,
      });
    }
    try {
      return JSON.stringify(
        await registryBook(offer, { idempotencyKey: `${keyPrefix}:${offer.id}`, forceFail: offerId === forceFailureOfferId }),
      );
    } catch {
      return JSON.stringify({ offerId, status: "failed", reason: "The supplier could not confirm this booking." });
    }
  }

  const bookFlightTool = tool(
    async ({ offerId }: { offerId: string }) => bookOffer(offerId, "flight"),
    {
      name: "book_flight",
      description: "Book the paid flight offer with this id. Call once per flight.",
      schema: z.object({ offerId: z.string() }),
    },
  );

  const bookHotelTool = tool(
    async ({ offerId }: { offerId: string }) => bookOffer(offerId, "hotel"),
    {
      name: "book_hotel",
      description: "Book the paid hotel offer with this id.",
      schema: z.object({ offerId: z.string() }),
    },
  );

  const bookActivityTool = tool(
    async ({ offerId }: { offerId: string }) => bookOffer(offerId, "activity"),
    {
      name: "book_activity",
      description: "Book the paid activity offer with this id.",
      schema: z.object({ offerId: z.string() }),
    },
  );

  return { tools: [bookFlightTool, bookHotelTool, bookActivityTool] };
}
