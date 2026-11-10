import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { verifyWebhookSignature } from "@/features/payments/paypal";

vi.mock("@/features/payments/paypal", () => ({
  verifyWebhookSignature: vi.fn(),
}));

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/webhooks/paypal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
        "paypal-transmission-id": "txn-1",
        "paypal-transmission-sig": "sig",
        "paypal-transmission-time": "2026-11-10T00:00:00Z",
      },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.mocked(verifyWebhookSignature).mockReset();
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/paypal", () => {
  it("rejects a body that isn't valid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/webhooks/paypal", { method: "POST", body: "not json" }),
    );
    expect(response.status).toBe(400);
    expect(verifyWebhookSignature).not.toHaveBeenCalled();
  });

  it("rejects a JSON body missing id or event_type", async () => {
    const response = await post({ resource: {} });
    expect(response.status).toBe(400);
    expect(verifyWebhookSignature).not.toHaveBeenCalled();
  });

  it("rejects an event with an invalid signature", async () => {
    vi.mocked(verifyWebhookSignature).mockResolvedValue(false);

    const response = await post({ id: "evt-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: {} });

    expect(response.status).toBe(401);
  });

  it("verifies against the PAYPAL-* transmission headers and logs a known event type", async () => {
    vi.mocked(verifyWebhookSignature).mockResolvedValue(true);

    const response = await post({
      id: "evt-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: "capture-1", amount: { value: "10.00" } },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(verifyWebhookSignature).toHaveBeenCalledWith(
      {
        authAlgo: "SHA256withRSA",
        certUrl: "https://api.sandbox.paypal.com/cert",
        transmissionId: "txn-1",
        transmissionSig: "sig",
        transmissionTime: "2026-11-10T00:00:00Z",
      },
      { id: "evt-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "capture-1", amount: { value: "10.00" } } },
    );
    expect(vi.mocked(console.log).mock.calls[0]?.[0]).toContain("PAYMENT.CAPTURE.COMPLETED");
  });

  it("still returns 200 for an unhandled event type, but notes it was unhandled", async () => {
    vi.mocked(verifyWebhookSignature).mockResolvedValue(true);

    const response = await post({ id: "evt-2", event_type: "SOME.OTHER.EVENT" });

    expect(response.status).toBe(200);
    expect(vi.mocked(console.log).mock.calls[0]?.[0]).toContain("unhandled");
  });

  it("does not reprocess a duplicate event id", async () => {
    vi.mocked(verifyWebhookSignature).mockResolvedValue(true);

    await post({ id: "evt-dup", event_type: "PAYMENT.CAPTURE.REFUNDED" });
    vi.mocked(console.log).mockClear();
    const response = await post({ id: "evt-dup", event_type: "PAYMENT.CAPTURE.REFUNDED" });

    expect(response.status).toBe(200);
    expect(vi.mocked(console.log).mock.calls[0]?.[0]).toContain("duplicate");
  });
});
