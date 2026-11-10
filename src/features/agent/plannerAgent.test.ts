import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAgentFinalMessage } from "./plannerAgent";
import { makePlannerTools } from "./tools";
import type { TripBrief } from "@/features/planner/tripBrief";
import { minorUnits, zonedDateTime } from "@/features/planner/types";

const fetchMock = vi.fn(async (url: string) => {
  if (url.includes("places/suggestions")) {
    return { ok: true, json: async () => ({ data: [{ iata_code: "SFO", time_zone: "UTC" }] }) };
  }
  return { ok: true, json: async () => ({ data: { offers: [] } }) };
});
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  process.env.DUFFEL_API_KEY = "test-key";
});

const brief: TripBrief = {
  origin: { city: "San Francisco", country: "United States" },
  destination: { city: "Honolulu", country: "United States" },
  timeZone: "UTC",
  travelers: 2,
  travelWindow: {
    startsAt: zonedDateTime("2026-07-10T00:00:00Z"),
    endsAt: zonedDateTime("2026-07-15T23:59:59Z"),
  },
  hardBudget: { currency: "USD", amountMinorUnits: minorUnits(350000) },
  preferences: ["beach"],
  constraints: [],
};

describe("parseAgentFinalMessage", () => {
  it("parses a plain JSON final message", () => {
    expect(parseAgentFinalMessage('{"offerIds":["a"],"note":"fits the brief"}')).toEqual({
      offerIds: ["a"],
      note: "fits the brief",
    });
  });

  it("parses a fenced JSON final message", () => {
    const fenced = '```json\n{"offerIds":["a","b"],"note":"two offers"}\n```';
    expect(parseAgentFinalMessage(fenced)).toEqual({
      offerIds: ["a", "b"],
      note: "two offers",
    });
  });

  it("rejects a final message missing required fields", () => {
    expect(() => parseAgentFinalMessage('{"offerIds":[]}')).toThrow();
  });
});

describe("makePlannerTools", () => {
  it("exposes the deal-hunting planner tools by name", async () => {
    const { tools } = makePlannerTools(brief, []);
    expect(tools.map((item) => item.name)).toEqual([
      "search_flights",
      "search_hotels",
      "search_activities",
      "compare_platforms",
      "check_market",
      "build_itinerary",
    ]);
  });
});
