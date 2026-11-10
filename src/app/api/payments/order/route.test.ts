import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createPlanOrder } from "@/features/payments/paypal";
import { getQuote, getQuoteSnapshot, markOrdered, saveQuote } from "@/features/quotes/quoteStore";
import { authedUser } from "@/lib/supabase/authedUser";
import { toTravelOffer, type TravelOfferView } from "@/features/planner/travelOffer";
import type { PlanQuote } from "@/features/quotes/quote";
import { repriceQuote } from "@/features/quotes/reprice";

vi.mock("@/features/payments/paypal", () => ({ createPlanOrder: vi.fn() }));
vi.mock("@/features/quotes/quoteStore", () => ({ getQuote: vi.fn(), markOrdered: vi.fn(), saveQuote: vi.fn(), getQuoteSnapshot: vi.fn(async () => null) }));
// Real repricing logic, through the real registry (synthetic offers reprice as unchanged).
vi.mock("@/features/quotes/reprice", async () => {
  const actual = await vi.importActual<typeof import("@/features/quotes/reprice")>("@/features/quotes/reprice");
  return { repriceQuote: vi.fn(actual.repriceQuote) };
});
vi.mock("@/lib/supabase/authedUser", () => ({ authedUser: vi.fn(async () => ({ supabase: null, user: null })) }));

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";

const hotel: TravelOfferView = {
  id: "hotel-main",
  supplier: "synthetic",
  supplierRef: "synthetic:hotel-main",
  productKind: "hotel",
  title: "Hotel",
  summary: "",
  startsAt: "2026-07-10T15:00:00Z",
  endsAt: "2026-07-14T10:00:00Z",
  costMinorUnits: 95000,
  currency: "USD",
  retrievedAt: "2026-07-01T00:00:00Z",
  expiresAt: "2026-07-01T00:15:00Z",
  cancellationTerms: null,
  synthetic: true,
};
const flight: TravelOfferView = { ...hotel, id: "flight-1", productKind: "flight", costMinorUnits: 62000 };

function quote(overrides: Partial<PlanQuote> = {}): PlanQuote {
  return {
    id: QUOTE_ID,
    userId: null,
    offers: [flight, hotel].map(toTravelOffer),
    totalMinorUnits: 157000,
    status: "quoted",
    paypalOrderId: null,
    approveUrl: null,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    ...overrides,
  };
}

afterEach(() => {
  vi.mocked(createPlanOrder).mockReset();
  vi.mocked(getQuote).mockReset();
  vi.mocked(markOrdered).mockReset();
  delete process.env.DEMO_MODE;
});

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/payments/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/payments/order", () => {
  it("rejects a body without a quote id", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ quoteId: "not-a-uuid" })).status).toBe(400);
  });

  it("ignores client-sent offers and charges the server-held quote", async () => {
    vi.mocked(getQuote).mockResolvedValue(quote());
    vi.mocked(markOrdered).mockResolvedValue(true);
    vi.mocked(createPlanOrder).mockResolvedValue({ id: "order-1", approveUrl: "https://sandbox/approve/order-1", status: "PAYER_ACTION_REQUIRED" });

    const tampered = { ...hotel, costMinorUnits: 1 };
    const response = await post({ quoteId: QUOTE_ID, offers: [tampered] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ orderId: "order-1", approveUrl: "https://sandbox/approve/order-1", amountMinorUnits: 157000 });
    const [offers, options] = vi.mocked(createPlanOrder).mock.calls[0];
    expect(offers.map((offer) => offer.costMinorUnits)).toEqual([62000, 95000]);
    expect(options).toEqual({
      requestId: `tw-order-${QUOTE_ID}`,
      customId: QUOTE_ID,
      returnUrls: { returnUrl: "http://localhost/checkout/return", cancelUrl: "http://localhost/checkout/return?cancelled=1" },
    });
    expect(markOrdered).toHaveBeenCalledWith(QUOTE_ID, expect.objectContaining({ paypalOrderId: "order-1" }));
  });

  it("returns 404 for an unknown quote", async () => {
    vi.mocked(getQuote).mockResolvedValue(null);
    expect((await post({ quoteId: QUOTE_ID })).status).toBe(404);
  });

  it("returns 404 when the quote belongs to another user", async () => {
    vi.mocked(getQuote).mockResolvedValue(quote({ userId: "owner" }));
    vi.mocked(authedUser).mockResolvedValueOnce({ supabase: null as never, user: { id: "someone-else" } as never });
    expect((await post({ quoteId: QUOTE_ID })).status).toBe(404);
    expect(createPlanOrder).not.toHaveBeenCalled();
  });

  it("re-checks prices first, so an expired quote whose prices still hold can be paid", async () => {
    vi.mocked(getQuote).mockResolvedValue(quote({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
    vi.mocked(markOrdered).mockResolvedValue(true);
    vi.mocked(createPlanOrder).mockResolvedValue({ id: "order-1", approveUrl: "https://sandbox/approve/order-1", status: "PAYER_ACTION_REQUIRED" });

    const response = await post({ quoteId: QUOTE_ID });

    expect(response.status).toBe(200);
    expect(repriceQuote).toHaveBeenCalled();
    const [offers] = vi.mocked(createPlanOrder).mock.calls[0];
    expect(offers.every((offer) => Date.parse(offer.expiresAt) > Date.now())).toBe(true);
  });

  it("never charges a changed price: saves it as a new quote and asks the traveller first", async () => {
    vi.mocked(getQuote).mockResolvedValue(
      quote({
        brief: {
          origin: { city: "San Francisco", country: "United States" },
          destination: { city: "Springfield", country: "United States" },
          timeZone: "UTC",
          travelers: 2,
          travelWindow: { startsAt: "2026-07-10T00:00:00Z", endsAt: "2026-07-15T23:59:59Z" },
          hardBudget: { currency: "USD", amountMinorUnits: 350000 },
          preferences: [],
          constraints: [],
        },
      }),
    );
    vi.mocked(repriceQuote).mockResolvedValueOnce({
      status: "changed",
      offers: [toTravelOffer({ ...flight, costMinorUnits: 70000 }), toTravelOffer(hotel)],
      previousTotalMinorUnits: 157000,
      totalMinorUnits: 165000,
    });
    vi.mocked(saveQuote).mockResolvedValue("22222222-2222-4222-8222-222222222222");

    const response = await post({ quoteId: QUOTE_ID });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ code: "quote-repriced", quoteId: "22222222-2222-4222-8222-222222222222", previousTotalMinorUnits: 157000 });
    expect(body.plan.totalCostMinorUnits).toBe(165000);
    expect(body.error).toContain("$1,650.00");
    expect(createPlanOrder).not.toHaveBeenCalled();
  });

  it("recovers a sold-out stay with the next option from the same search, and asks before charging it", async () => {
    vi.mocked(getQuote).mockResolvedValue(
      quote({
        brief: {
          origin: { city: "San Francisco", country: "United States" },
          destination: { city: "Springfield", country: "United States" },
          timeZone: "UTC",
          travelers: 2,
          travelWindow: { startsAt: "2026-07-10T00:00:00Z", endsAt: "2026-07-15T23:59:59Z" },
          hardBudget: { currency: "USD", amountMinorUnits: 350000 },
          preferences: [],
          constraints: [],
        },
      }),
    );
    vi.mocked(repriceQuote).mockResolvedValueOnce({ status: "unavailable", offerId: "hotel-main", reason: "This room is no longer available at this rate." });
    const backup = { ...hotel, id: "hotel-backup", title: "Backup Inn", costMinorUnits: 90000 };
    vi.mocked(getQuoteSnapshot).mockResolvedValue({ catalog: [flight, hotel, backup].map(toTravelOffer), insights: null });
    vi.mocked(saveQuote).mockResolvedValue("33333333-3333-4333-8333-333333333333");

    const response = await post({ quoteId: QUOTE_ID });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ code: "quote-repriced", quoteId: "33333333-3333-4333-8333-333333333333" });
    expect(body.error).toContain("switched to Backup Inn");
    expect(body.plan.offers.map((o: { id: string }) => o.id)).toContain("hotel-backup");
    expect(createPlanOrder).not.toHaveBeenCalled();
  });

  it("sends the traveller back to planning when an offer is gone", async () => {
    vi.mocked(getQuote).mockResolvedValue(quote());
    vi.mocked(repriceQuote).mockResolvedValueOnce({ status: "unavailable", offerId: "flight-1", reason: "This fare is no longer available." });
    const response = await post({ quoteId: QUOTE_ID });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "quote-unavailable", offerId: "flight-1" });
    expect(createPlanOrder).not.toHaveBeenCalled();
  });

  it("refuses to charge when a supplier can't confirm the price", async () => {
    vi.mocked(getQuote).mockResolvedValue(quote());
    vi.mocked(repriceQuote).mockRejectedValueOnce(new Error("Duffel 503"));
    const response = await post({ quoteId: QUOTE_ID });
    expect(response.status).toBe(503);
    expect(createPlanOrder).not.toHaveBeenCalled();
  });

  it("returns the existing order for an already-ordered quote without creating another", async () => {
    vi.mocked(getQuote).mockResolvedValue(
      quote({ status: "ordered", paypalOrderId: "order-1", approveUrl: "https://sandbox/approve/order-1" }),
    );
    const response = await post({ quoteId: QUOTE_ID });
    expect(await response.json()).toEqual({ orderId: "order-1", approveUrl: "https://sandbox/approve/order-1", amountMinorUnits: 157000 });
    expect(createPlanOrder).not.toHaveBeenCalled();
  });

  it("refuses a quote that was already paid", async () => {
    vi.mocked(getQuote).mockResolvedValue(quote({ status: "completed", paypalOrderId: "order-1" }));
    expect((await post({ quoteId: QUOTE_ID })).status).toBe(409);
  });

  it("only accepts a direct supplier payee in demo mode, and never on a flight", async () => {
    vi.mocked(getQuote).mockResolvedValue(quote());
    const payee = { offerId: "hotel-main", email: "sb-hotel@personal.example.com" };
    expect((await post({ quoteId: QUOTE_ID, demoDirectPayee: payee })).status).toBe(400);

    process.env.DEMO_MODE = "true";
    expect((await post({ quoteId: QUOTE_ID, demoDirectPayee: { ...payee, offerId: "flight-1" } })).status).toBe(400);

    vi.mocked(markOrdered).mockResolvedValue(true);
    vi.mocked(createPlanOrder).mockResolvedValue({ id: "order-2", approveUrl: "https://sandbox/approve/order-2", status: "PAYER_ACTION_REQUIRED" });
    expect((await post({ quoteId: QUOTE_ID, demoDirectPayee: payee })).status).toBe(200);
    const [offers] = vi.mocked(createPlanOrder).mock.calls[0];
    expect(offers.find((offer) => offer.id === "hotel-main")?.supplierPayeeEmail).toBe(payee.email);
  });

  it("returns 503 when PayPal order creation fails", async () => {
    vi.mocked(getQuote).mockResolvedValue(quote());
    vi.mocked(createPlanOrder).mockRejectedValue(new Error("down"));
    expect((await post({ quoteId: QUOTE_ID })).status).toBe(503);
  });
});
