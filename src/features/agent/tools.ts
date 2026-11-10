import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { buildItinerary, selectOffers } from "@/features/planner/planner";
import type { TripBrief } from "@/features/planner/tripBrief";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { bookOffer as registryBook } from "@/features/suppliers/registry";

/**
 * The planner's tools read from one catalog the caller already searched
 * (`searchCatalog`). The agent never triggers a supplier call itself, and the
 * server rebuilds the final plan from this same catalog.
 */
export function makePlannerTools(brief: TripBrief, catalog: readonly TravelOffer[]) {
  const flights = catalog.filter((offer) => offer.productKind === "flight");
  const hotels = catalog.filter((offer) => offer.productKind === "hotel");
  const activities = catalog.filter((offer) => offer.productKind === "activity");

  const searchFlightsTool = tool(
    async () => JSON.stringify(flights),
    {
      name: "search_flights",
      description: "Return available real flight offers for the trip.",
      schema: z.object({}),
    },
  );

  const searchHotelsTool = tool(
    async () => JSON.stringify(hotels),
    {
      name: "search_hotels",
      description: "Return available sample hotels for the trip.",
      schema: z.object({}),
    },
  );

  const searchActivitiesTool = tool(
    async () => JSON.stringify(activities),
    {
      name: "search_activities",
      description: "Return available sample activities for the trip.",
      schema: z.object({}),
    },
  );

  const buildItineraryTool = tool(
    async ({ offerIds }: { offerIds: string[] }) =>
      JSON.stringify(buildItinerary(brief, selectOffers(catalog, offerIds))),
    {
      name: "build_itinerary",
      description:
        "Build and evaluate an itinerary from selected offer ids. Returns the deterministic total and feasibility.",
      schema: z.object({ offerIds: z.array(z.string()) }),
    },
  );

  return {
    catalog,
    tools: [searchFlightsTool, searchHotelsTool, searchActivitiesTool, buildItineraryTool],
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
