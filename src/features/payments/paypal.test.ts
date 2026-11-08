import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capturePlanOrder, createPlanOrder, PLAN_PRICE_MINOR_UNITS } from "./paypal";

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

describe("createPlanOrder", () => {
  it("creates a capturable order and returns the approval link", async () => {
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

    const result = await createPlanOrder();

    expect(result).toEqual({ id: "order-1", approveUrl: "https://sandbox/approve/order-1" });
    const createBody = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string);
    expect(createBody.purchase_units[0].amount.value).toBe(
      (PLAN_PRICE_MINOR_UNITS / 100).toFixed(2),
    );
  });
});

describe("capturePlanOrder", () => {
  it("captures an approved order", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(jsonResponse({ status: "APPROVED" }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(jsonResponse({ status: "COMPLETED" }));

    const result = await capturePlanOrder("order-1");

    expect(result).toEqual({ status: "COMPLETED" });
  });

  it("does not re-capture an already completed order", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(jsonResponse({ status: "COMPLETED" }));

    const result = await capturePlanOrder("order-1");

    expect(result).toEqual({ status: "COMPLETED" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
