import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { refundCapture } from "@/features/payments/paypal";

vi.mock("@/features/payments/paypal", () => ({
  refundCapture: vi.fn(),
}));

afterEach(() => {
  vi.mocked(refundCapture).mockReset();
});

function post(body: string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/payments/refund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
}

describe("POST /api/payments/refund", () => {
  it("rejects a body missing captureId or amountMinorUnits", async () => {
    const response = await post(JSON.stringify({ reason: "oops" }));
    expect(response.status).toBe(400);
    expect(refundCapture).not.toHaveBeenCalled();
  });

  it("refunds the given capture for the given amount and reason", async () => {
    vi.mocked(refundCapture).mockResolvedValue({ status: "COMPLETED", refundId: "refund-1" });

    const response = await post(
      JSON.stringify({ captureId: "capture-1", amountMinorUnits: 9500, reason: "Supplier booking failed" }),
    );

    expect(response.status).toBe(200);
    expect(refundCapture).toHaveBeenCalledWith("capture-1", 9500, "Supplier booking failed");
    expect(await response.json()).toEqual({ status: "COMPLETED", refundId: "refund-1" });
  });

  it("works without a reason", async () => {
    vi.mocked(refundCapture).mockResolvedValue({ status: "COMPLETED", refundId: "refund-2" });

    const response = await post(JSON.stringify({ captureId: "capture-2", amountMinorUnits: 500 }));

    expect(response.status).toBe(200);
    expect(refundCapture).toHaveBeenCalledWith("capture-2", 500, undefined);
  });

  it("returns 503 when PayPal rejects the refund (e.g. invalid capture id or amount)", async () => {
    vi.mocked(refundCapture).mockRejectedValue(new Error("PayPal refund failed."));

    const response = await post(JSON.stringify({ captureId: "bad-capture", amountMinorUnits: 100 }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Refund could not be completed." });
  });
});
