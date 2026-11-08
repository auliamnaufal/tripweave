import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { runPlannerAgent } from "@/features/agent/plannerAgent";

vi.mock("@/features/agent/plannerAgent", () => ({
  runPlannerAgent: vi.fn(),
}));

vi.mock("@/features/suppliers/duffel", async () => {
  const synthetic = await import("@/features/suppliers/synthetic");
  return { searchAllOffers: synthetic.searchAllOffers };
});

const validBrief = {
  origin: { city: "San Francisco", country: "United States" },
  destination: { city: "Honolulu", country: "United States" },
  timeZone: "UTC",
  travelers: 2,
  travelWindow: {
    startsAt: "2026-07-10T00:00:00Z",
    endsAt: "2026-07-15T23:59:59Z",
  },
  hardBudget: { currency: "USD", amountMinorUnits: 350000 },
  preferences: ["beach"],
  constraints: [],
};

afterEach(() => {
  vi.mocked(runPlannerAgent).mockReset();
});

function post(body: string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
}

describe("POST /api/plan", () => {
  it("returns 400 for malformed briefs", async () => {
    for (const body of ["not-json", "{}"]) {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "The trip brief is invalid." });
    }
  });

  it("returns a generic 503 when the agent fails without leaking the cause", async () => {
    vi.mocked(runPlannerAgent).mockRejectedValue(new Error("raw provider failure"));

    const response = await post(JSON.stringify(validBrief));

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ error: "The planner is unavailable. Please try again." });
    expect(JSON.stringify(body)).not.toContain("raw provider failure");
  });

  it("recomputes the deterministic plan from the agent's selected offer ids", async () => {
    vi.mocked(runPlannerAgent).mockResolvedValue({
      offerIds: ["flight-arrival", "hotel-main", "activity-0-beach"],
      note: "A simple plan under budget.",
    });

    const response = await post(JSON.stringify(validBrief));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.note).toBe("A simple plan under budget.");
    expect(body.source).toBe("duffel+synthetic");
    expect(body.plan.totalCostMinorUnits).toBe(157000);
    expect(body.plan.status).toBe("feasible");
    expect(body.plan.offers.map((offer: { id: string }) => offer.id)).toEqual([
      "flight-arrival",
      "hotel-main",
      "activity-0-beach",
    ]);
  });
});
