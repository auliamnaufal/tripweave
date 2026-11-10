import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { capturePlanOrder, refundCapture, type PlanOrderStatus } from "@/features/payments/paypal";
import { runBookings, type BookingRunOutput } from "@/features/suppliers/bookingExecutor";
import { authedUser } from "@/lib/supabase/authedUser";
import {
  getQuoteByOrderId,
  listBookings,
  setQuoteStatus,
  transitionQuote,
  writeBookings,
} from "@/features/quotes/quoteStore";
import { toTravelOffer, type TravelOfferView } from "@/features/planner/travelOffer";
import type { PlanQuote } from "@/features/quotes/quote";

vi.mock("@/features/payments/paypal", () => ({
  BUNDLE_REFERENCE_ID: "tripweave-bundle",
  capturePlanOrder: vi.fn(),
  refundCapture: vi.fn(),
}));

vi.mock("@/features/suppliers/bookingExecutor", () => ({
  runBookings: vi.fn(),
}));

vi.mock("@/features/quotes/quoteStore", () => ({
  getQuoteByOrderId: vi.fn(),
  listBookings: vi.fn(),
  setQuoteStatus: vi.fn(),
  transitionQuote: vi.fn(),
  writeBookings: vi.fn(),
}));

// Guest by default (no Supabase session).
vi.mock("@/lib/supabase/authedUser", () => ({ authedUser: vi.fn(async () => ({ supabase: null, user: null })) }));

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";

const flightOffer: TravelOfferView = {
  id: "flight-1",
  supplier: "duffel",
  supplierRef: "duffel:1",
  productKind: "flight",
  title: "Flight",
  summary: "",
  startsAt: "2026-07-10T00:00:00Z",
  endsAt: "2026-07-10T03:00:00Z",
  costMinorUnits: 62000,
  currency: "USD",
  retrievedAt: "2026-07-01T00:00:00Z",
  expiresAt: "2026-07-01T00:15:00Z",
  cancellationTerms: null,
  synthetic: false,
};

const hotelOffer: TravelOfferView = {
  ...flightOffer,
  id: "hotel-main",
  supplier: "synthetic",
  supplierRef: "synthetic:hotel-main",
  productKind: "hotel",
  costMinorUnits: 95000,
  synthetic: true,
};

function quote(offers: TravelOfferView[], overrides: Partial<PlanQuote> = {}): PlanQuote {
  const parsed = offers.map(toTravelOffer);
  return {
    id: QUOTE_ID,
    userId: null,
    offers: parsed,
    totalMinorUnits: parsed.reduce((sum, offer) => sum + offer.costMinorUnits, 0),
    status: "ordered",
    paypalOrderId: "order-1",
    approveUrl: "https://sandbox/approve/order-1",
    expiresAt: "2026-07-01T00:15:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(transitionQuote).mockResolvedValue(true);
  vi.mocked(setQuoteStatus).mockResolvedValue();
  vi.mocked(writeBookings).mockResolvedValue();
});

afterEach(() => {
  vi.mocked(capturePlanOrder).mockReset();
  vi.mocked(refundCapture).mockReset();
  vi.mocked(runBookings).mockReset();
  vi.mocked(getQuoteByOrderId).mockReset();
  vi.mocked(listBookings).mockReset();
  vi.mocked(setQuoteStatus).mockReset();
  vi.mocked(transitionQuote).mockReset();
  vi.mocked(writeBookings).mockReset();
  delete process.env.DEMO_MODE;
});

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/payments/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** Mimics runBookings's real shape: an async generator that returns the final output. */
function bookingGenerator(output: BookingRunOutput): ReturnType<typeof runBookings> {
  async function* generator() {
    yield { kind: "tool-call" as const, tool: "book_flight" as const, label: "Booking flight…" };
    return output;
  }
  return generator();
}

/** A capture result with a single bundle purchase unit — today's no-onboarded-supplier case. */
function bundleCapture(amountMinorUnits: number, status = "COMPLETED", captureId = "capture-1"): PlanOrderStatus {
  return {
    status: "COMPLETED",
    purchaseUnits: [{ referenceId: "tripweave-bundle", amountMinorUnits, captureId, captureStatus: status }],
  };
}

async function readLines(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

describe("POST /api/payments/capture", () => {
  it("rejects an invalid body", async () => {
    const response = await post({ offers: [] });
    expect(response.status).toBe(400);
  });

  it("returns 404 for an order that no quote was created for", async () => {
    vi.mocked(getQuoteByOrderId).mockResolvedValue(null);
    const response = await post({ orderId: "order-unknown" });
    expect(response.status).toBe(404);
    expect(capturePlanOrder).not.toHaveBeenCalled();
  });

  it("refuses a second concurrent capture of the same order", async () => {
    vi.mocked(getQuoteByOrderId).mockResolvedValue(quote([flightOffer]));
    vi.mocked(transitionQuote).mockResolvedValue(false);
    const response = await post({ orderId: "order-1" });
    expect(response.status).toBe(409);
    expect(capturePlanOrder).not.toHaveBeenCalled();
  });

  it("replays the stored outcome for an already-completed capture without touching PayPal", async () => {
    vi.mocked(getQuoteByOrderId).mockResolvedValue(quote([flightOffer, hotelOffer], { status: "completed" }));
    vi.mocked(listBookings).mockResolvedValue([
      { offerId: "flight-1", status: "booked", amountMinorUnits: 62000, bookingRef: "ref-1", failureReason: null, refundStatus: null },
      { offerId: "hotel-main", status: "failed", amountMinorUnits: 95000, bookingRef: null, failureReason: "sold out", refundStatus: "COMPLETED" },
    ]);

    const events = await readLines(await post({ orderId: "order-1" }));

    expect(capturePlanOrder).not.toHaveBeenCalled();
    expect(events).toContainEqual({ kind: "refund", offerId: "hotel-main", amountMinorUnits: 95000, status: "COMPLETED" });
    expect(events.at(-1)).toMatchObject({ kind: "summary", bookedMinorUnits: 62000, refundedMinorUnits: 95000 });
  });

  it("stops before booking and releases the lock when the payment did not complete", async () => {
    vi.mocked(getQuoteByOrderId).mockResolvedValue(quote([flightOffer]));
    vi.mocked(capturePlanOrder).mockResolvedValue({
      status: "APPROVED",
      purchaseUnits: [{ referenceId: "tripweave-bundle", amountMinorUnits: 62000 }],
    });

    const events = await readLines(await post({ orderId: "order-1" }));

    expect(events).toEqual([
      { kind: "payment", status: "APPROVED", amountMinorUnits: 62000 },
      { kind: "error", message: "Payment was not completed." },
    ]);
    expect(setQuoteStatus).toHaveBeenCalledWith(QUOTE_ID, "ordered");
    expect(runBookings).not.toHaveBeenCalled();
  });

  it("sends the buyer back to PayPal when the funding source was declined, without booking", async () => {
    vi.mocked(getQuoteByOrderId).mockResolvedValue(quote([flightOffer]));
    vi.mocked(capturePlanOrder).mockResolvedValue({ status: "INSTRUMENT_DECLINED", purchaseUnits: [] });

    const events = await readLines(await post({ orderId: "order-1" }));

    expect(events.at(-1)).toEqual({ kind: "error", message: "PayPal declined that payment method. Approve again on PayPal with another one." });
    expect(setQuoteStatus).toHaveBeenCalledWith(QUOTE_ID, "ordered");
    expect(runBookings).not.toHaveBeenCalled();
  });

  it("books nothing while PayPal holds the capture as PENDING", async () => {
    vi.mocked(getQuoteByOrderId).mockResolvedValue(quote([flightOffer]));
    vi.mocked(capturePlanOrder).mockResolvedValue(bundleCapture(62000, "PENDING"));

    const events = await readLines(await post({ orderId: "order-1" }));

    expect(events.at(-1)).toEqual({ kind: "error", message: "PayPal is still reviewing this payment. Booking starts once it clears." });
    expect(setQuoteStatus).toHaveBeenCalledWith(QUOTE_ID, "needs_attention");
    expect(runBookings).not.toHaveBeenCalled();
  });

  it("flags the quote for a human when the captured amount doesn't match it", async () => {
    vi.mocked(getQuoteByOrderId).mockResolvedValue(quote([flightOffer]));
    vi.mocked(capturePlanOrder).mockResolvedValue(bundleCapture(1));

    const events = await readLines(await post({ orderId: "order-1" }));

    expect(events.at(-1)).toEqual({ kind: "error", message: "The paid amount does not match this itinerary." });
    expect(setQuoteStatus).toHaveBeenCalledWith(QUOTE_ID, "needs_attention");
    expect(runBookings).not.toHaveBeenCalled();
  });

  it("books the quote's own offers, records each booking, and streams a summary", async () => {
    vi.mocked(getQuoteByOrderId).mockResolvedValue(quote([flightOffer, hotelOffer]));
    vi.mocked(capturePlanOrder).mockResolvedValue(bundleCapture(157000));
    vi.mocked(runBookings).mockReturnValue(
      bookingGenerator({
        results: [
          { offerId: "flight-1", status: "booked", bookingRef: "ref-1" },
          { offerId: "hotel-main", status: "booked", bookingRef: "ref-2" },
        ],
        note: "Both booked.",
      }),
    );

    const events = await readLines(await post({ orderId: "order-1" }));

    expect(capturePlanOrder).toHaveBeenCalledWith("order-1", { requestId: `tw-capture-${QUOTE_ID}` });
    expect(events[0]).toEqual({ kind: "payment", status: "COMPLETED", amountMinorUnits: 157000 });
    expect(events.at(-1)).toEqual({
      kind: "summary",
      results: [
        { offerId: "flight-1", status: "booked", bookingRef: "ref-1" },
        { offerId: "hotel-main", status: "booked", bookingRef: "ref-2" },
      ],
      note: "Both booked.",
      bookedMinorUnits: 157000,
      refundedMinorUnits: 0,
    });
    expect(writeBookings).toHaveBeenCalledWith(expect.anything(), [
      { offerId: "flight-1", status: "booked", bookingRef: "ref-1" },
      { offerId: "hotel-main", status: "booked", bookingRef: "ref-2" },
    ]);
    expect(setQuoteStatus).toHaveBeenLastCalledWith(QUOTE_ID, "completed");
    expect(refundCapture).not.toHaveBeenCalled();
  });

  it("refunds a failed item with an idempotency key and records the refund", async () => {
    vi.mocked(getQuoteByOrderId).mockResolvedValue(quote([flightOffer, hotelOffer]));
    vi.mocked(capturePlanOrder).mockResolvedValue(bundleCapture(157000, "COMPLETED", "capture-bundle"));
    vi.mocked(runBookings).mockReturnValue(
      bookingGenerator({
        results: [
          { offerId: "flight-1", status: "booked", bookingRef: "ref-1" },
          { offerId: "hotel-main", status: "failed", reason: "sold out" },
        ],
        note: "One failed.",
      }),
    );
    vi.mocked(refundCapture).mockResolvedValue({ status: "COMPLETED", refundId: "refund-1" });

    const events = await readLines(await post({ orderId: "order-1" }));

    expect(refundCapture).toHaveBeenCalledWith("capture-bundle", 95000, { requestId: `tw-refund-${QUOTE_ID}-hotel-main` });
    expect(writeBookings).toHaveBeenCalledWith(expect.anything(), [
      { offerId: "hotel-main", status: "failed", refundId: "refund-1", refundStatus: "COMPLETED" },
    ]);
    expect(events).toContainEqual({ kind: "refund", offerId: "hotel-main", amountMinorUnits: 95000, status: "COMPLETED" });
    expect(events.at(-1)).toMatchObject({ kind: "summary", bookedMinorUnits: 62000, refundedMinorUnits: 95000 });
  });

  it("ignores a forced failure unless DEMO_MODE is on", async () => {
    vi.mocked(getQuoteByOrderId).mockResolvedValue(quote([flightOffer]));
    vi.mocked(capturePlanOrder).mockResolvedValue(bundleCapture(62000));
    vi.mocked(runBookings).mockImplementation(() =>
      bookingGenerator({ results: [{ offerId: "flight-1", status: "booked", bookingRef: "ref-1" }], note: "Booked." }),
    );

    await readLines(await post({ orderId: "order-1", forceFailureOfferId: "flight-1" }));
    expect(runBookings).toHaveBeenLastCalledWith(expect.any(Array), { keyPrefix: QUOTE_ID, forceFailureOfferId: undefined });

    process.env.DEMO_MODE = "true";
    await readLines(await post({ orderId: "order-1", forceFailureOfferId: "flight-1" }));
    expect(runBookings).toHaveBeenLastCalledWith(expect.any(Array), { keyPrefix: QUOTE_ID, forceFailureOfferId: "flight-1" });
  });

  it("flags the quote and streams a generic error if booking throws after capture", async () => {
    vi.mocked(getQuoteByOrderId).mockResolvedValue(quote([flightOffer]));
    vi.mocked(capturePlanOrder).mockResolvedValue(bundleCapture(62000));
    vi.mocked(runBookings).mockImplementation(() => {
      throw new Error("raw provider failure");
    });

    const events = await readLines(await post({ orderId: "order-1" }));

    expect(events.at(-1)).toEqual({ kind: "error", message: "Booking could not be completed." });
    expect(setQuoteStatus).toHaveBeenLastCalledWith(QUOTE_ID, "needs_attention");
  });

  it("pays an Onboarded Supplier's offer directly, honestly reporting a PENDING_REVIEW hold, and never routes it through booking", async () => {
    const directOffer = { ...hotelOffer, supplierPayeeEmail: "sb-r2jl753813374@personal.example.com" };
    vi.mocked(getQuoteByOrderId).mockResolvedValue(quote([flightOffer, directOffer]));
    vi.mocked(capturePlanOrder).mockResolvedValue({
      status: "COMPLETED",
      purchaseUnits: [
        { referenceId: "tripweave-bundle", amountMinorUnits: 62000, captureId: "capture-bundle", captureStatus: "COMPLETED" },
        {
          referenceId: "hotel-main",
          amountMinorUnits: 95000,
          captureId: "capture-hotel",
          captureStatus: "PENDING",
          captureStatusReason: "PENDING_REVIEW",
        },
      ],
    });
    vi.mocked(runBookings).mockReturnValue(
      bookingGenerator({ results: [{ offerId: "flight-1", status: "booked", bookingRef: "ref-1" }], note: "Booked the flight." }),
    );

    const events = await readLines(await post({ orderId: "order-1" }));

    expect(events).toContainEqual({
      kind: "direct-payment",
      offerId: "hotel-main",
      status: "PENDING",
      reason: "PENDING_REVIEW",
      amountMinorUnits: 95000,
    });
    expect(runBookings).toHaveBeenCalledWith([toTravelOffer(flightOffer)], { keyPrefix: QUOTE_ID, forceFailureOfferId: undefined });
    expect(refundCapture).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ kind: "summary", bookedMinorUnits: 62000, refundedMinorUnits: 0 });
  });

  it("records an order receipt for a signed-in owner once payment completes", async () => {
    vi.mocked(getQuoteByOrderId).mockResolvedValue(quote([flightOffer], { userId: "user-1" }));
    vi.mocked(capturePlanOrder).mockResolvedValue(bundleCapture(62000));
    vi.mocked(runBookings).mockReturnValue(
      bookingGenerator({ results: [{ offerId: "flight-1", status: "booked", bookingRef: "ref-1" }], note: "Booked." }),
    );
    const insert = vi.fn(async () => ({ error: null }));
    vi.mocked(authedUser).mockResolvedValueOnce({
      supabase: { from: vi.fn(() => ({ insert })) } as never,
      user: { id: "user-1" } as never,
    });

    const events = await readLines(await post({ orderId: "order-1", destId: "oahu", title: "5 nights in Oahu" }));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", dest_id: "oahu", title: "5 nights in Oahu", total_minor_units: 62000 }),
    );
    expect(events.at(-1)).toMatchObject({ kind: "summary" });
  });

  it("hides another user's quote", async () => {
    vi.mocked(getQuoteByOrderId).mockResolvedValue(quote([flightOffer], { userId: "owner" }));
    const response = await post({ orderId: "order-1" });
    expect(response.status).toBe(404);
  });

  it("skips the booking agent entirely when every offer was paid directly", async () => {
    const directOffer = { ...hotelOffer, supplierPayeeEmail: "sb-r2jl753813374@personal.example.com" };
    vi.mocked(getQuoteByOrderId).mockResolvedValue(quote([directOffer]));
    vi.mocked(capturePlanOrder).mockResolvedValue({
      status: "COMPLETED",
      purchaseUnits: [
        { referenceId: "hotel-main", amountMinorUnits: 95000, captureId: "capture-hotel", captureStatus: "PENDING", captureStatusReason: "PENDING_REVIEW" },
      ],
    });

    const events = await readLines(await post({ orderId: "order-1" }));

    expect(runBookings).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({
      kind: "summary",
      results: [],
      note: "Every offer was paid directly to its own supplier. No simulated booking was needed.",
      bookedMinorUnits: 0,
      refundedMinorUnits: 0,
    });
  });
});
