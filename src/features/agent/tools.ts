import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { buildItinerary, selectOffers } from "@/features/planner/planner";
import type { TripBrief } from "@/features/planner/tripBrief";
import { searchActivities, searchFlights, searchHotels } from "@/features/suppliers/duffel";

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
