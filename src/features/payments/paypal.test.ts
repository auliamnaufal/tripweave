import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capturePlanOrder, createPlanOrder, refundCapture } from "./paypal";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";

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

function offer(id: string, costMinorUnits: number, supplierPayeeEmail?: string): TravelOffer {
  return {
    id,
    supplier: "synthetic",
    supplierRef: `synthetic:${id}`,
    productKind: "hotel",
    title: id,
    summary: "",
    startsAt: zonedDateTime("2026-07-10T00:00:00Z"),
    endsAt: zonedDateTime("2026-07-11T00:00:00Z"),
    costMinorUnits: minorUnits(costMinorUnits),
    currency: "USD",
    retrievedAt: "2026-07-01T00:00:00Z",
    expiresAt: "2026-07-01T00:15:00Z",
    cancellationTerms: null,
    synthetic: true,
    supplierPayeeEmail,
  };
}

/** Shape returned by GET /orders/{id} — always echoes each purchase unit's own amount. */
function orderDetail(status: string, units: { referenceId: string; amountValue: string; captureId?: string }[]) {
  return {
    status,
    purchase_units: units.map((unit) => ({
      reference_id: unit.referenceId,
      amount: { value: unit.amountValue },
      payments: unit.captureId
        ? { captures: [{ id: unit.captureId, amount: { value: unit.amountValue } }] }
        : undefined,
    })),
  };
}

/**
 * Shape actually returned by POST /orders/{id}/capture — unlike GET, a unit does
 * NOT echo its own top-level amount; only payments.captures[0].amount is
 * present, per PayPal's own documented single-unit and multi-payee capture
 * response shape. See docs/adr/0002-multi-payee-orders-pay-suppliers-directly.md
 * for the unit-tested-but-not-yet-live-verified status of the multi-payee case.
 */
function captureResponse(
  status: string,
  units: { referenceId: string; amountValue: string; captureId: string; captureStatus?: string; reason?: string }[],
) {
  return {
    status,
    purchase_units: units.map((unit) => ({
      reference_id: unit.referenceId,
      payments: {
        captures: [
          {
            id: unit.captureId,
            amount: { value: unit.amountValue },
            status: unit.captureStatus,
            status_details: unit.reason ? { reason: unit.reason } : undefined,
          },
        ],
      },
    })),
  };
}

const item = (name: string, value: string, sku: string) => ({ name: `Stay: ${name}`, quantity: "1", unit_amount: { currency_code: "USD", value }, sku });

describe("createPlanOrder", () => {
  it("follows the current Orders v2 guide: experience_context under payment_source.paypal, no deprecated application_context", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: "order-1",
          status: "PAYER_ACTION_REQUIRED",
          links: [
            { rel: "self", href: "https://api.sandbox/v2/checkout/orders/order-1" },
            { rel: "payer-action", href: "https://sandbox.paypal.com/checkoutnow?token=order-1" },
          ],
        }),
      );

    const result = await createPlanOrder([offer("flight-1", 62000), offer("hotel-main", 95000)], {
      requestId: "tw-order-q",
      customId: "q",
      returnUrls: { returnUrl: "http://localhost:3000/checkout/return", cancelUrl: "http://localhost:3000/checkout/return?cancelled=1" },
    });

    expect(result).toEqual({ id: "order-1", approveUrl: "https://sandbox.paypal.com/checkoutnow?token=order-1", status: "PAYER_ACTION_REQUIRED" });
    const init = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["PayPal-Request-Id"]).toBe("tw-order-q");
    const createBody = JSON.parse(init.body as string);
    expect(createBody.intent).toBe("CAPTURE");
    expect(createBody.application_context).toBeUndefined();
    expect(createBody.payment_source).toEqual({
      paypal: {
        experience_context: {
          brand_name: "Tripweave",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: "http://localhost:3000/checkout/return",
          cancel_url: "http://localhost:3000/checkout/return?cancelled=1",
        },
      },
    });
    expect(createBody.purchase_units).toEqual([
      {
        reference_id: "tripweave-bundle",
        description: "Tripweave trip: flights, stay and activities",
        amount: { currency_code: "USD", value: "1570.00", breakdown: { item_total: { currency_code: "USD", value: "1570.00" } } },
        items: [item("flight-1", "620.00", "flight-1"), item("hotel-main", "950.00", "hotel-main")],
        custom_id: "q",
      },
    ]);
  });

  it("still accepts a legacy approve link", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(jsonResponse({ id: "order-1", status: "CREATED", links: [{ rel: "approve", href: "https://sandbox/approve/order-1" }] }));
    expect((await createPlanOrder([offer("hotel-main", 95000)])).approveUrl).toBe("https://sandbox/approve/order-1");
  });

  it("leaves free items out of the line items so PayPal's totals still match", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(jsonResponse({ id: "o", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "x" }] }));
    await createPlanOrder([offer("hotel-main", 95000), offer("beach", 0)]);
    const unit = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string).purchase_units[0];
    expect(unit.items).toHaveLength(1);
    expect(unit.amount.breakdown.item_total.value).toBe(unit.amount.value);
  });

  it("gives an Onboarded Supplier's offer its own purchase unit and payee, matching PayPal's documented multi-payee shape", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(jsonResponse({ id: "order-2", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "x" }] }));

    await createPlanOrder([
      offer("flight-sim", 600),
      offer("hotel-real", 400, "sb-r2jl753813374@personal.example.com"),
    ]);

    const units = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string).purchase_units;
    expect(units.map((u: { reference_id: string; amount: { value: string }; payee?: unknown }) => [u.reference_id, u.amount.value, u.payee])).toEqual([
      ["tripweave-bundle", "6.00", undefined],
      ["hotel-real", "4.00", { email_address: "sb-r2jl753813374@personal.example.com" }],
    ]);
  });

  it("omits the bundle unit entirely when every offer has its own payee", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(jsonResponse({ id: "order-3", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "x" }] }));

    await createPlanOrder([offer("hotel-real", 400, "sb-r2jl753813374@personal.example.com")]);

    const units = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string).purchase_units;
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ reference_id: "hotel-real", payee: { email_address: "sb-r2jl753813374@personal.example.com" } });
  });
});

describe("capturePlanOrder", () => {
  it("captures an approved single-unit order and returns its amount and capture id, from the capture response's own shape", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(
        jsonResponse(orderDetail("APPROVED", [{ referenceId: "tripweave-bundle", amountValue: "1570.00" }])),
      )
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      // Regression test: the real POST .../capture response has no top-level
      // purchase_units[].amount (see captureResponse's doc comment) — a mock
      // that always includes it (like orderDetail does) would hide this bug.
      .mockResolvedValueOnce(
        jsonResponse(
          captureResponse("COMPLETED", [
            { referenceId: "tripweave-bundle", amountValue: "1570.00", captureId: "capture-1", captureStatus: "COMPLETED" },
          ]),
        ),
      );

    const result = await capturePlanOrder("order-1");

    expect(result).toEqual({
      status: "COMPLETED",
      purchaseUnits: [
        {
          referenceId: "tripweave-bundle",
          amountMinorUnits: 157000,
          captureId: "capture-1",
          captureStatus: "COMPLETED",
          captureStatusReason: undefined,
        },
      ],
    });
  });

  it("does not try to capture an order the buyer has not approved yet", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(jsonResponse(orderDetail("CREATED", [{ referenceId: "tripweave-bundle", amountValue: "1570.00" }])));

    const result = await capturePlanOrder("order-1");

    expect(result.status).toBe("CREATED");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not re-capture an already completed order", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(
        jsonResponse(
          orderDetail("COMPLETED", [{ referenceId: "tripweave-bundle", amountValue: "1570.00", captureId: "capture-1" }]),
        ),
      );

    const result = await capturePlanOrder("order-1");

    expect(result).toEqual({
      status: "COMPLETED",
      purchaseUnits: [
        {
          referenceId: "tripweave-bundle",
          amountMinorUnits: 157000,
          captureId: "capture-1",
          captureStatus: undefined,
          captureStatusReason: undefined,
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports every purchase unit from a multi-payee capture, matching PayPal's documented capture response shape", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(
        jsonResponse(
          orderDetail("APPROVED", [
            { referenceId: "flight-sim", amountValue: "6.00" },
            { referenceId: "hotel-real", amountValue: "4.00" },
          ]),
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(
        jsonResponse(
          captureResponse("COMPLETED", [
            { referenceId: "flight-sim", amountValue: "6.00", captureId: "capture-flight", captureStatus: "COMPLETED" },
            {
              referenceId: "hotel-real",
              amountValue: "4.00",
              captureId: "capture-hotel",
              captureStatus: "PENDING",
              reason: "PENDING_REVIEW",
            },
          ]),
        ),
      );

    const result = await capturePlanOrder("order-7TE26225XJ6364436");

    expect(result).toEqual({
      status: "COMPLETED",
      purchaseUnits: [
        {
          referenceId: "flight-sim",
          amountMinorUnits: 600,
          captureId: "capture-flight",
          captureStatus: "COMPLETED",
          captureStatusReason: undefined,
        },
        {
          referenceId: "hotel-real",
          amountMinorUnits: 400,
          captureId: "capture-hotel",
          captureStatus: "PENDING",
          captureStatusReason: "PENDING_REVIEW",
        },
      ],
    });
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

  it("passes an optional reason through as PayPal's note_to_payer", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(jsonResponse({ id: "refund-1", status: "COMPLETED" }));

    await refundCapture("capture-1", 9500, { reason: "Supplier booking failed" });

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      amount: { currency_code: "USD", value: "95.00" },
      note_to_payer: "Supplier booking failed",
    });
  });
});

describe("capturePlanOrder declines", () => {
  it("reports INSTRUMENT_DECLINED as a recoverable status instead of throwing", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(jsonResponse(orderDetail("APPROVED", [{ referenceId: "tripweave-bundle", amountValue: "10.00" }])))
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(jsonResponse({ name: "UNPROCESSABLE_ENTITY", details: [{ issue: "INSTRUMENT_DECLINED" }], debug_id: "abc" }, false));

    const result = await capturePlanOrder("order-1", { requestId: "tw-capture-q" });

    expect(result.status).toBe("INSTRUMENT_DECLINED");
    const init = fetchMock.mock.calls[3]?.[1] as RequestInit;
    expect(init.body).toBe("{}");
    expect((init.headers as Record<string, string>)["PayPal-Request-Id"]).toBe("tw-capture-q");
  });
});
