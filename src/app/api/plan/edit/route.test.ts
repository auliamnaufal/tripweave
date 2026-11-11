import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { getQuote, getQuoteSnapshot, saveQuote } from "@/features/quotes/quoteStore";
import type { PlanQuote, QuoteStatus } from "@/features/quotes/quote";
import { toTravelOffer, type TravelOffer } from "@/features/planner/travelOffer";

vi.mock("@/features/quotes/quoteStore", () => ({
  getQuote: vi.fn(),
  getQuoteSnapshot: vi.fn(),
  saveQuote: vi.fn(async () => "22222222-2222-4222-8222-222222222222"),
}));
vi.mock("@/lib/supabase/authedUser", () => ({ authedUser: vi.fn(async () => ({ supabase: null, user: { id: "u1" } })) }));

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";

function offer(id: string, kind: TravelOffer["productKind"], cost: number, startsAt: string, endsAt: string): TravelOffer {
  return toTravelOffer({
    id,
    supplier: "synthetic",
    supplierRef: `synthetic:${id}`,
    productKind: kind,
    title: kind === "flight" ? "SFO to NRT, direct" : id,
    summary: "",
    startsAt,
    endsAt,
    costMinorUnits: cost,
    currency: "USD",
    retrievedAt: "2026-11-10T00:00:00Z",
    expiresAt: "2026-12-01T00:00:00Z",
    cancellationTerms: null,
    synthetic: true,
  });
}

const out0 = offer("flight-outbound-0", "flight", 40000, "2026-12-10T08:00:00Z", "2026-12-10T14:00:00Z");
const out1 = offer("flight-nt-outbound-1", "flight", 35000, "2026-12-10T09:00:00Z", "2026-12-10T15:00:00Z");
const hotelA = offer("hotel-a", "hotel", 30000, "2026-12-10T15:00:00Z", "2026-12-13T10:00:00Z");
const hotelB = offer("hotel-b", "hotel", 25000, "2026-12-10T15:00:00Z", "2026-12-13T10:00:00Z");
const tea = offer("act-tea", "activity", 4000, "2026-12-11T10:00:00Z", "2026-12-11T12:00:00Z");
const walk = offer("act-walk", "activity", 0, "2026-12-11T11:00:00Z", "2026-12-11T13:00:00Z");
const museum = offer("act-museum", "activity", 2500, "2026-12-12T10:00:00Z", "2026-12-12T12:00:00Z");

const brief = {
  origin: { city: "San Francisco", country: "United States" },
  destination: { city: "Tokyo", country: "Japan" },
  timeZone: "UTC",
  travelers: 2,
  travelWindow: { startsAt: "2026-12-10T00:00:00Z", endsAt: "2026-12-13T23:59:59Z" },
  hardBudget: { currency: "USD", amountMinorUnits: 200000 },
  preferences: [],
  constraints: [],
};

function quote(status: QuoteStatus): PlanQuote {
  return { id: QUOTE_ID, userId: "u1", offers: [out0, hotelA, tea], totalMinorUnits: 74000, status, paypalOrderId: null, approveUrl: null, expiresAt: "2026-12-01T00:00:00Z", brief };
}

function post(offerIds: string[]) {
  return POST(new Request("http://localhost/api/plan/edit", { method: "POST", body: JSON.stringify({ quoteId: QUOTE_ID, offerIds }) }));
}

beforeEach(() => {
  vi.mocked(getQuote).mockResolvedValue(quote("quoted"));
  vi.mocked(getQuoteSnapshot).mockResolvedValue({ catalog: [out0, out1, hotelA, hotelB, tea, walk, museum], insights: null });
  vi.mocked(saveQuote).mockClear();
});

describe("POST /api/plan/edit", () => {
  it("saves a swapped flight, a swapped stay and an added activity as a new quote, priced by the server", async () => {
    const response = await post(["flight-nt-outbound-1", "hotel-b", "act-tea", "act-museum"]);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.quoteId).toBe("22222222-2222-4222-8222-222222222222");
    expect(body.plan.totalCostMinorUnits).toBe(35000 + 25000 + 4000 + 2500);
    expect(body.activityOptions.map((o: { offerId: string }) => o.offerId)).toContain("act-walk");
    expect(body.choices.length).toBeGreaterThan(0);
    expect(vi.mocked(saveQuote).mock.calls[0][0].offers.map((o) => o.id)).toEqual(["flight-nt-outbound-1", "hotel-b", "act-tea", "act-museum"]);
  });

  it("still edits a plan that has a PayPal order but isn't paid, and refuses one that is", async () => {
    vi.mocked(getQuote).mockResolvedValue(quote("ordered"));
    expect((await post(["flight-outbound-0", "hotel-a"])).status).toBe(200);
    for (const status of ["capturing", "completed", "needs_attention"] as const) {
      vi.mocked(getQuote).mockResolvedValue(quote(status));
      expect((await post(["flight-outbound-0", "hotel-a"])).status).toBe(409);
    }
  });

  it("refuses a clash, a changed trip shape, and an offer that isn't in the search", async () => {
    const clash = await post(["flight-outbound-0", "hotel-a", "act-tea", "act-walk"]);
    expect(clash.status).toBe(409);
    expect((await clash.json()).error).toMatch(/overlaps/);
    expect((await post(["flight-outbound-0", "act-tea"])).status).toBe(409);
    expect((await post(["flight-outbound-0", "hotel-a", "made-up"])).status).toBe(409);
    expect(saveQuote).not.toHaveBeenCalled();
  });

  it("rejects a malformed body before touching anything", async () => {
    const response = await POST(new Request("http://localhost/api/plan/edit", { method: "POST", body: JSON.stringify({ quoteId: "nope", offerIds: [] }) }));
    expect(response.status).toBe(400);
    expect(getQuote).not.toHaveBeenCalledWith("nope");
  });
});
