import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { buildItinerary, selectOffers } from "@/features/planner/planner";
import type { TripBrief } from "@/features/planner/tripBrief";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { searchActivities, searchFlights, searchHotels } from "@/features/suppliers/duffel";
import { simulateBooking } from "@/features/suppliers/booking";

export async function makePlannerTools(brief: TripBrief) {
  const flights = await searchFlights(brief);
  const hotels = searchHotels(brief);
  const activities = searchActivities(brief);
  const catalog = [...flights, ...hotels, ...activities];

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
export function makeBookingTools(offers: readonly TravelOffer[], forceFailureOfferId?: string) {
  const byId = new Map(offers.map((offer) => [offer.id, offer]));

  function bookOffer(offerId: string, expectedKind: TravelOffer["productKind"]): string {
    const offer = byId.get(offerId);
    if (!offer) return JSON.stringify({ offerId, status: "failed", reason: "Unknown offer id." });
    if (offer.productKind !== expectedKind) {
      return JSON.stringify({
        offerId,
        status: "failed",
        reason: `Expected a ${expectedKind}, got a ${offer.productKind}.`,
      });
    }
    return JSON.stringify(simulateBooking(offer, offerId === forceFailureOfferId));
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
