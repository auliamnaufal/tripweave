import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createPlanOrder } from "@/features/payments/paypal";

vi.mock("@/features/payments/paypal", () => ({
  createPlanOrder: vi.fn(),
}));

const offer = {
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

afterEach(() => {
  vi.mocked(createPlanOrder).mockReset();
});

function post(body: string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/payments/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
}

describe("POST /api/payments/order", () => {
  it("rejects an invalid body", async () => {
    const response = await post(JSON.stringify({ offers: [] }));
    expect(response.status).toBe(400);
  });

  it("derives the order amount from the offers' own costs, not a client-sent total", async () => {
    vi.mocked(createPlanOrder).mockResolvedValue({ id: "order-1", approveUrl: "https://sandbox/approve/order-1" });

    const response = await post(JSON.stringify({ offers: [offer, { ...offer, id: "flight-1", costMinorUnits: 62000 } ] }));

    expect(response.status).toBe(200);
    expect(createPlanOrder).toHaveBeenCalledWith(157000);
    expect(await response.json()).toEqual({
      orderId: "order-1",
      approveUrl: "https://sandbox/approve/order-1",
      amountMinorUnits: 157000,
    });
  });

  it("returns 503 when PayPal order creation fails", async () => {
    vi.mocked(createPlanOrder).mockRejectedValue(new Error("down"));

    const response = await post(JSON.stringify({ offers: [offer] }));

    expect(response.status).toBe(503);
  });
});
