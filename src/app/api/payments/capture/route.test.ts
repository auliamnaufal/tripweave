import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { capturePlanOrder, refundCapture } from "@/features/payments/paypal";
import { streamBookingAgent, type BookingAgentOutput } from "@/features/agent/bookingAgent";

vi.mock("@/features/payments/paypal", () => ({
  capturePlanOrder: vi.fn(),
  refundCapture: vi.fn(),
}));

vi.mock("@/features/agent/bookingAgent", () => ({
  streamBookingAgent: vi.fn(),
}));

const flightOffer = {
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

const hotelOffer = {
  ...flightOffer,
  id: "hotel-main",
  supplier: "synthetic",
  supplierRef: "synthetic:hotel-main",
  productKind: "hotel",
  costMinorUnits: 95000,
  synthetic: true,
};

afterEach(() => {
  vi.mocked(capturePlanOrder).mockReset();
  vi.mocked(refundCapture).mockReset();
  vi.mocked(streamBookingAgent).mockReset();
});

function post(body: string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/payments/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
}

/** Mimics streamBookingAgent's real shape: an async generator that returns the final output. */
function bookingGenerator(output: BookingAgentOutput): ReturnType<typeof streamBookingAgent> {
  async function* generator() {
    yield { kind: "tool-call" as const, tool: "book_flight" as const, label: "Booking flight…" };
    return output;
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

describe("POST /api/payments/capture", () => {
  it("rejects an invalid body", async () => {
    const response = await post(JSON.stringify({ orderId: "order-1", offers: [] }));
    expect(response.status).toBe(400);
  });

  it("stops before booking when the payment did not complete", async () => {
    vi.mocked(capturePlanOrder).mockResolvedValue({ status: "APPROVED", amountMinorUnits: 62000 });

    const response = await post(JSON.stringify({ orderId: "order-1", offers: [flightOffer] }));
    const events = await readLines(response);

    expect(events).toEqual([
      { kind: "payment", status: "APPROVED", amountMinorUnits: 62000 },
      { kind: "error", message: "Payment was not completed." },
    ]);
    expect(streamBookingAgent).not.toHaveBeenCalled();
  });

  it("stops before booking when the offers don't sum to what was captured", async () => {
    vi.mocked(capturePlanOrder).mockResolvedValue({
      status: "COMPLETED",
      amountMinorUnits: 1,
      captureId: "capture-1",
    });

    const response = await post(JSON.stringify({ orderId: "order-1", offers: [flightOffer] }));
    const events = await readLines(response);

    expect(events).toEqual([
      { kind: "payment", status: "COMPLETED", amountMinorUnits: 1 },
      { kind: "error", message: "The paid amount does not match this itinerary." },
    ]);
    expect(streamBookingAgent).not.toHaveBeenCalled();
  });

  it("books every offer and streams a summary with nothing refunded when all succeed", async () => {
    vi.mocked(capturePlanOrder).mockResolvedValue({
      status: "COMPLETED",
      amountMinorUnits: 157000,
      captureId: "capture-1",
    });
    vi.mocked(streamBookingAgent).mockReturnValue(
      bookingGenerator({
        results: [
          { offerId: "flight-1", status: "booked", bookingRef: "ref-1" },
          { offerId: "hotel-main", status: "booked", bookingRef: "ref-2" },
        ],
        note: "Both booked.",
      }),
    );

    const response = await post(
      JSON.stringify({ orderId: "order-1", offers: [flightOffer, hotelOffer] }),
    );
    const events = await readLines(response);

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
    expect(refundCapture).not.toHaveBeenCalled();
  });

  it("refunds a failed item's share and reflects it in the summary", async () => {
    vi.mocked(capturePlanOrder).mockResolvedValue({
      status: "COMPLETED",
      amountMinorUnits: 157000,
      captureId: "capture-1",
    });
    vi.mocked(streamBookingAgent).mockReturnValue(
      bookingGenerator({
        results: [
          { offerId: "flight-1", status: "booked", bookingRef: "ref-1" },
          { offerId: "hotel-main", status: "failed", reason: "sold out" },
        ],
        note: "One failed.",
      }),
    );
    vi.mocked(refundCapture).mockResolvedValue({ status: "COMPLETED", refundId: "refund-1" });

    const response = await post(
      JSON.stringify({ orderId: "order-1", offers: [flightOffer, hotelOffer] }),
    );
    const events = await readLines(response);

    expect(refundCapture).toHaveBeenCalledWith("capture-1", 95000);
    expect(events).toContainEqual({
      kind: "refund",
      offerId: "hotel-main",
      amountMinorUnits: 95000,
      status: "COMPLETED",
    });
    expect(events.at(-1)).toEqual({
      kind: "summary",
      results: [
        { offerId: "flight-1", status: "booked", bookingRef: "ref-1" },
        { offerId: "hotel-main", status: "failed", reason: "sold out" },
      ],
      note: "One failed.",
      bookedMinorUnits: 62000,
      refundedMinorUnits: 95000,
    });
  });

  it("streams a generic error if booking throws, without leaking the cause", async () => {
    vi.mocked(capturePlanOrder).mockResolvedValue({
      status: "COMPLETED",
      amountMinorUnits: 62000,
      captureId: "capture-1",
    });
    vi.mocked(streamBookingAgent).mockImplementation(() => {
      throw new Error("raw provider failure");
    });

    const response = await post(JSON.stringify({ orderId: "order-1", offers: [flightOffer] }));
    const events = await readLines(response);

    expect(events.at(-1)).toEqual({ kind: "error", message: "Booking could not be completed." });
  });
});
