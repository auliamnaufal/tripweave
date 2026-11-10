import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { streamPlannerAgent, type AgentOutput } from "@/features/agent/plannerAgent";
import { saveQuote } from "@/features/quotes/quoteStore";

vi.mock("@/features/agent/plannerAgent", () => ({
  streamPlannerAgent: vi.fn(),
}));

vi.mock("@/features/quotes/quoteStore", () => ({
  saveQuote: vi.fn(async () => "quote-1"),
}));

vi.mock("@/lib/supabase/authedUser", () => ({ authedUser: vi.fn(async () => ({ supabase: null, user: null })) }));

// The real registry, with every kind served by the synthetic adapter: no network.
vi.mock("@/features/suppliers/registry", async () => {
  const actual = await vi.importActual<typeof import("@/features/suppliers/registry")>("@/features/suppliers/registry");
  const { syntheticAdapter } = await import("@/features/suppliers/synthetic");
  const route = { primary: [syntheticAdapter], fallback: [], required: true };
  return {
    ...actual,
    searchCatalog: vi.fn((brief: Parameters<typeof actual.searchCatalog>[0]) =>
      actual.searchCatalog(brief, { routes: { flight: route, hotel: route, activity: route }, timeoutMs: 1000 }),
    ),
  };
});

const validBrief = {
  origin: { city: "San Francisco", country: "United States" },
  destination: { city: "Springfield", country: "United States" },
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
      expect(await response.json()).toMatchObject({ error: "The trip brief is invalid." });
    }
  });

  it("says what to change when a brief breaks a rule", async () => {
    const cases: [unknown, string][] = [
      [{ ...validBrief, travelers: 12 }, "At most 9 travellers per trip."],
      [{ ...validBrief, hardBudget: { currency: "USD", amountMinorUnits: 0 } }, "The budget must be more than zero."],
      [{ ...validBrief, travelWindow: { startsAt: "2026-07-15T00:00:00Z", endsAt: "2026-07-10T00:00:00Z" } }, "The trip must end after it starts."],
      [{ ...validBrief, travelWindow: { startsAt: "2026-07-01T00:00:00Z", endsAt: "2026-09-01T00:00:00Z" } }, "Trips can be at most 30 nights."],
      [{ ...validBrief, destination: validBrief.origin }, "Pick a destination different from where you're flying from."],
      [{ ...validBrief, preferences: ["x".repeat(500)] }, ""],
    ];
    for (const [body, reason] of cases) {
      const response = await post(JSON.stringify(body));
      expect(response.status).toBe(400);
      if (reason) expect((await response.json()).reason).toBe(reason);
    }
    expect(streamPlannerAgent).not.toHaveBeenCalled();
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
    expect(planEvent.source).toBe("synthetic");
    const plan = planEvent.plan as { totalCostMinorUnits: number; status: string; offers: { id: string }[] };
    expect(plan.totalCostMinorUnits).toBe(157000);
    expect(plan.status).toBe("feasible");
    expect(plan.offers.map((offer) => offer.id)).toEqual([
      "flight-arrival",
      "hotel-main",
      "activity-0-beach",
    ]);
    // The exact server-priced offers are saved as the quote checkout will pay.
    expect(planEvent.quoteId).toBe("quote-1");
    const saved = vi.mocked(saveQuote).mock.calls[0][0];
    expect(saved.userId).toBeNull();
    expect(saved.offers.map((offer) => offer.costMinorUnits).reduce((a, b) => a + b, 0)).toBe(157000);
  });

  it("hands the agent the same catalog the plan is rebuilt from", async () => {
    vi.mocked(streamPlannerAgent).mockReturnValue(agentGenerator({ offerIds: ["hotel-main"], note: "Plan." }));

    await readLines(await post(JSON.stringify(validBrief)));

    const catalog = vi.mocked(streamPlannerAgent).mock.calls[0][1];
    expect(catalog.map((offer) => offer.id)).toContain("hotel-main");
    expect(catalog.map((offer) => offer.id)).toContain("flight-arrival");
  });

  it("says which kind is missing when a required supplier has nothing", async () => {
    const { searchCatalog, CatalogUnavailableError } = await import("@/features/suppliers/registry");
    vi.mocked(searchCatalog).mockRejectedValueOnce(new CatalogUnavailableError("flight"));

    const events = await readLines(await post(JSON.stringify(validBrief)));

    expect(events).toEqual([
      { kind: "error", message: "No flight offers are available for this trip right now. Try other dates or another destination." },
    ]);
    expect(streamPlannerAgent).not.toHaveBeenCalled();
  });

  it("still returns a viewable plan, without a quote id, if the quote can't be saved", async () => {
    vi.mocked(saveQuote).mockRejectedValueOnce(new Error("db down"));
    vi.mocked(streamPlannerAgent).mockReturnValue(
      agentGenerator({ offerIds: ["flight-arrival", "hotel-main"], note: "Plan." }),
    );

    const events = (await readLines(await post(JSON.stringify(validBrief)))) as Record<string, unknown>[];

    expect(events[0].kind).toBe("plan");
    expect(events[0].quoteId).toBeUndefined();
  });
});
