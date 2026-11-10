import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capturePlanOrder, createPlanOrder, refundCapture, verifyWebhookSignature } from "./paypal";
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

describe("createPlanOrder", () => {
  it("sums offers with no supplier payee into one bundle purchase unit with no payee", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: "order-1",
          links: [{ rel: "approve", href: "https://sandbox/approve/order-1" }],
        }),
      );

    const result = await createPlanOrder([offer("flight-1", 62000), offer("hotel-main", 95000)]);

    expect(result).toEqual({ id: "order-1", approveUrl: "https://sandbox/approve/order-1" });
    const createBody = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string);
    expect(createBody.purchase_units).toEqual([
      { reference_id: "tripweave-bundle", amount: { currency_code: "USD", value: "1570.00" } },
    ]);
    // Without this, PayPal's hosted page gets stuck in a "Continue to review
    // order" loop with nowhere to redirect back to — see the comment in paypal.ts.
    expect(createBody.application_context).toEqual({
      shipping_preference: "NO_SHIPPING",
      user_action: "PAY_NOW",
    });
  });

  it("gives an Onboarded Supplier's offer its own purchase unit and payee, matching PayPal's documented multi-payee shape", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: "order-2",
          links: [{ rel: "approve", href: "https://sandbox/approve/order-2" }],
        }),
      );

    await createPlanOrder([
      offer("flight-sim", 600),
      offer("hotel-real", 400, "sb-r2jl753813374@personal.example.com"),
    ]);

    const createBody = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string);
    expect(createBody.purchase_units).toEqual([
      { reference_id: "tripweave-bundle", amount: { currency_code: "USD", value: "6.00" } },
      {
        reference_id: "hotel-real",
        amount: { currency_code: "USD", value: "4.00" },
        payee: { email_address: "sb-r2jl753813374@personal.example.com" },
      },
    ]);
  });

  it("omits the bundle unit entirely when every offer has its own payee", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(
        jsonResponse({ id: "order-3", links: [{ rel: "approve", href: "https://sandbox/approve/order-3" }] }),
      );

    await createPlanOrder([offer("hotel-real", 400, "sb-r2jl753813374@personal.example.com")]);

    const createBody = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string);
    expect(createBody.purchase_units).toEqual([
      {
        reference_id: "hotel-real",
        amount: { currency_code: "USD", value: "4.00" },
        payee: { email_address: "sb-r2jl753813374@personal.example.com" },
      },
    ]);
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

    await refundCapture("capture-1", 9500, "Supplier booking failed");

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      amount: { currency_code: "USD", value: "95.00" },
      note_to_payer: "Supplier booking failed",
    });
  });
});

describe("verifyWebhookSignature", () => {
  const headers = {
    authAlgo: "SHA256withRSA",
    certUrl: "https://api.sandbox.paypal.com/cert",
    transmissionId: "txn-1",
    transmissionSig: "sig",
    transmissionTime: "2026-11-10T00:00:00Z",
  };
  const event = { id: "evt-1", event_type: "PAYMENT.CAPTURE.COMPLETED" };

  beforeEach(() => {
    process.env.PAYPAL_WEBHOOK_ID = "webhook-1";
  });

  it("sends the transmission headers and event body to PayPal's verify endpoint", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(jsonResponse({ verification_status: "SUCCESS" }));

    const result = await verifyWebhookSignature(headers, event);

    expect(result).toBe(true);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature");
    expect(JSON.parse(init.body as string)).toEqual({
      auth_algo: "SHA256withRSA",
      cert_url: "https://api.sandbox.paypal.com/cert",
      transmission_id: "txn-1",
      transmission_sig: "sig",
      transmission_time: "2026-11-10T00:00:00Z",
      webhook_id: "webhook-1",
      webhook_event: event,
    });
  });

  it("returns false when PayPal reports the signature as failed", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }))
      .mockResolvedValueOnce(jsonResponse({ verification_status: "FAILURE" }));

    expect(await verifyWebhookSignature(headers, event)).toBe(false);
  });
});
