import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capturePlanOrder, createPlanOrder, refundCapture } from "./paypal";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  process.env.PAYPAL_CLIENT_ID = "client";
  process.env.PAYPAL_CLIENT_SECRET = "secret";
});

afterEach(() => {
  fetchMock.mockReset();
});

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

function orderDetail(status: string, amountValue: string, captureId?: string) {
  return {
    status,
    purchase_units: [
      {
        amount: { value: amountValue },
        payments: captureId ? { captures: [{ id: captureId }] } : undefined,
      },
    ],
  };
}

describe("createPlanOrder", () => {
  it("creates a capturable order for the given amount and returns the approval link", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: "order-1",
          links: [
            { rel: "self", href: "https://sandbox/self" },
            { rel: "approve", href: "https://sandbox/approve/order-1" },
          ],
        }),
      );

    const result = await createPlanOrder(157000);

    expect(result).toEqual({ id: "order-1", approveUrl: "https://sandbox/approve/order-1" });
    const createBody = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string);
    expect(createBody.purchase_units[0].amount.value).toBe("1570.00");
  });
});

describe("capturePlanOrder", () => {
  it("captures an approved order and returns its amount and capture id", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(jsonResponse(orderDetail("APPROVED", "1570.00")))
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(jsonResponse(orderDetail("COMPLETED", "1570.00", "capture-1")));

    const result = await capturePlanOrder("order-1");

    expect(result).toEqual({ status: "COMPLETED", amountMinorUnits: 157000, captureId: "capture-1" });
  });

  it("does not re-capture an already completed order", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(jsonResponse(orderDetail("COMPLETED", "1570.00", "capture-1")));

    const result = await capturePlanOrder("order-1");

    expect(result).toEqual({ status: "COMPLETED", amountMinorUnits: 157000, captureId: "capture-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("refundCapture", () => {
  it("refunds the given amount against a capture id", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(jsonResponse({ id: "refund-1", status: "COMPLETED" }));

    const result = await refundCapture("capture-1", 9500);

    expect(result).toEqual({ status: "COMPLETED", refundId: "refund-1" });
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("https://api-m.sandbox.paypal.com/v2/payments/captures/capture-1/refund");
    expect(JSON.parse(init.body as string)).toEqual({ amount: { currency_code: "USD", value: "95.00" } });
  });
});
