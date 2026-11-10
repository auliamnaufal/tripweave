import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { verifyWebhookSignature } from "@/features/payments/paypal";
import {
  getQuote,
  listBookings,
  markWebhookProcessed,
  recordWebhookEvent,
  setQuoteStatus,
  transitionQuote,
} from "@/features/quotes/quoteStore";
import type { PlanQuote } from "@/features/quotes/quote";

vi.mock("@/features/payments/paypal", async () => {
  const actual = await vi.importActual<typeof import("@/features/payments/paypal")>("@/features/payments/paypal");
  return { ...actual, verifyWebhookSignature: vi.fn() };
});
vi.mock("@/features/quotes/quoteStore", () => ({
  getQuote: vi.fn(),
  listBookings: vi.fn(),
  markWebhookProcessed: vi.fn(),
  recordWebhookEvent: vi.fn(),
  setQuoteStatus: vi.fn(),
  transitionQuote: vi.fn(),
}));

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";

const signed = {
  "paypal-transmission-id": "t-1",
  "paypal-transmission-time": "2026-11-10T00:00:00Z",
  "paypal-transmission-sig": "sig",
  "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT",
  "paypal-auth-algo": "SHA256withRSA",
};

function quote(status: PlanQuote["status"]): PlanQuote {
  return { id: QUOTE_ID, userId: null, offers: [], totalMinorUnits: 0, status, paypalOrderId: "o", approveUrl: null, expiresAt: "" };
}

function deliver(eventType: string, headers: Record<string, string> = signed, id = "WH-1") {
  return POST(
    new Request("http://localhost/api/webhooks/paypal", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ id, event_type: eventType, resource: { id: "CAP-1", custom_id: QUOTE_ID, status: "COMPLETED" } }),
    }),
  );
}

beforeEach(() => {
  process.env.PAYPAL_WEBHOOK_ID = "WH-ID";
  vi.mocked(verifyWebhookSignature).mockResolvedValue(true);
  vi.mocked(recordWebhookEvent).mockResolvedValue(true);
  vi.mocked(markWebhookProcessed).mockResolvedValue();
  vi.mocked(listBookings).mockResolvedValue([]);
  vi.mocked(transitionQuote).mockResolvedValue(true);
  vi.mocked(setQuoteStatus).mockResolvedValue();
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.PAYPAL_WEBHOOK_ID;
});

describe("POST /api/webhooks/paypal", () => {
  it("refuses deliveries when no webhook id is configured", async () => {
    delete process.env.PAYPAL_WEBHOOK_ID;
    expect((await deliver("PAYMENT.CAPTURE.COMPLETED")).status).toBe(503);
  });

  it("rejects a delivery without PayPal's signature headers, or one PayPal says is not genuine", async () => {
    expect((await deliver("PAYMENT.CAPTURE.COMPLETED", {})).status).toBe(400);
    vi.mocked(verifyWebhookSignature).mockResolvedValueOnce(false);
    expect((await deliver("PAYMENT.CAPTURE.COMPLETED")).status).toBe(400);
    expect(recordWebhookEvent).not.toHaveBeenCalled();
  });

  it("verifies against the configured webhook id with the event exactly as received", async () => {
    vi.mocked(getQuote).mockResolvedValue(quote("completed"));
    await deliver("PAYMENT.CAPTURE.COMPLETED");
    expect(verifyWebhookSignature).toHaveBeenCalledWith(
      expect.objectContaining({ transmissionId: "t-1", authAlgo: "SHA256withRSA" }),
      expect.objectContaining({ id: "WH-1", event_type: "PAYMENT.CAPTURE.COMPLETED" }),
      "WH-ID",
    );
  });

  it("acknowledges a repeat delivery without acting on it again", async () => {
    vi.mocked(recordWebhookEvent).mockResolvedValueOnce(false);
    const response = await deliver("PAYMENT.CAPTURE.DENIED");
    expect(await response.json()).toEqual({ ok: true, duplicate: true });
    expect(setQuoteStatus).not.toHaveBeenCalled();
  });

  it("releases a quote held for a PENDING capture once PayPal says it completed", async () => {
    vi.mocked(getQuote).mockResolvedValue(quote("needs_attention"));
    const response = await deliver("PAYMENT.CAPTURE.COMPLETED");
    expect(await response.json()).toEqual({ ok: true, outcome: "released-for-booking" });
    expect(transitionQuote).toHaveBeenCalledWith(QUOTE_ID, "needs_attention", "ordered");
    expect(markWebhookProcessed).toHaveBeenCalledWith("WH-1", "released-for-booking", QUOTE_ID);
  });

  it("leaves a quote with real bookings for a human instead of re-running it", async () => {
    vi.mocked(getQuote).mockResolvedValue(quote("needs_attention"));
    vi.mocked(listBookings).mockResolvedValue([
      { offerId: "f", status: "booked", amountMinorUnits: 1, bookingRef: "r", failureReason: null, refundStatus: null },
    ]);
    expect(await (await deliver("PAYMENT.CAPTURE.COMPLETED")).json()).toEqual({ ok: true, outcome: "left-for-review" });
    expect(transitionQuote).not.toHaveBeenCalled();
  });

  it("flags the quote when money is denied or pulled back", async () => {
    vi.mocked(getQuote).mockResolvedValue(quote("completed"));
    expect(await (await deliver("PAYMENT.CAPTURE.REVERSED")).json()).toEqual({ ok: true, outcome: "flagged" });
    expect(setQuoteStatus).toHaveBeenCalledWith(QUOTE_ID, "needs_attention");
  });

  it("answers 500 when processing fails, so PayPal redelivers", async () => {
    vi.mocked(getQuote).mockRejectedValue(new Error("db down"));
    expect((await deliver("PAYMENT.CAPTURE.COMPLETED")).status).toBe(500);
    expect(markWebhookProcessed).not.toHaveBeenCalled();
  });
});
