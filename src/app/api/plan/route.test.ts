import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { streamPlannerAgent, type AgentOutput } from "@/features/agent/plannerAgent";

vi.mock("@/features/agent/plannerAgent", () => ({
  streamPlannerAgent: vi.fn(),
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
  vi.mocked(streamPlannerAgent).mockReset();
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

/** Mimics streamPlannerAgent's real shape: an async generator that returns the final AgentOutput. */
function agentGenerator(output: AgentOutput): ReturnType<typeof streamPlannerAgent> {
  async function* generator() {
    return output;
  }
  return generator();
}

function failingAgentGenerator(error: Error): ReturnType<typeof streamPlannerAgent> {
  async function* generator(): AsyncGenerator<never, never> {
    throw error;
  }
  return generator();
}

async function readLines(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

describe("POST /api/plan", () => {
  it("returns 400 for malformed briefs", async () => {
    for (const body of ["not-json", "{}"]) {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "The trip brief is invalid." });
    }
  });

  it("streams an error event when the agent fails, without leaking the cause", async () => {
    vi.mocked(streamPlannerAgent).mockReturnValue(failingAgentGenerator(new Error("raw provider failure")));

    const response = await post(JSON.stringify(validBrief));

    expect(response.status).toBe(200);
    const events = await readLines(response);
    expect(events).toEqual([{ kind: "error", message: "The planner is unavailable. Please try again." }]);
  });

  it("streams the recomputed deterministic plan from the agent's selected offer ids", async () => {
    vi.mocked(streamPlannerAgent).mockReturnValue(
      agentGenerator({
        offerIds: ["flight-arrival", "hotel-main", "activity-0-beach"],
        note: "A simple plan under budget.",
      }),
    );

    const response = await post(JSON.stringify(validBrief));

    expect(response.status).toBe(200);
    const events = await readLines(response);
    expect(events).toHaveLength(1);
    const [planEvent] = events as [Record<string, unknown>];
    expect(planEvent.kind).toBe("plan");
    expect(planEvent.note).toBe("A simple plan under budget.");
    expect(planEvent.source).toBe("duffel+synthetic");
    const plan = planEvent.plan as { totalCostMinorUnits: number; status: string; offers: { id: string }[] };
    expect(plan.totalCostMinorUnits).toBe(157000);
    expect(plan.status).toBe("feasible");
    expect(plan.offers.map((offer) => offer.id)).toEqual([
      "flight-arrival",
      "hotel-main",
      "activity-0-beach",
    ]);
  });
});
