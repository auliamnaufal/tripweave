import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client, Environment } from "@paypal/paypal-server-sdk";
import { capturePlanOrder, createPlanOrder, refundCapture, setPayPalClient } from "./paypal";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";

// The PayPal Server SDK sends requests through axios, so these tests fake its
// transport the way the SDK's own testing guide does: an axios adapter passed
// through `unstable_httpClientOptions`, answering from a queue and recording
// every request it sees. A seeded, unexpired OAuth token means no token
// request ever reaches the adapter, so `requests[i]` is the i-th API call.

type Reply = { status: number; body: unknown };
type SentRequest = { method: string; url: string; data?: string; headers: Record<string, string> };

let replies: Reply[] = [];
let requests: SentRequest[] = [];

function reply(body: unknown, status = 200) {
  replies.push({ status, body });
}

function sentBody(index: number) {
  return JSON.parse(requests[index].data ?? "null");
}

function sentHeader(index: number, name: string): string | undefined {
  const entry = Object.entries(requests[index].headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

beforeEach(() => {
  replies = [];
  requests = [];
  setPayPalClient(
    new Client({
      environment: Environment.Sandbox,
      clientCredentialsAuthCredentials: {
        oAuthClientId: "client",
        oAuthClientSecret: "secret",
        oAuthToken: { accessToken: "seeded-token", tokenType: "Bearer", expiry: BigInt(Math.floor(Date.now() / 1000) + 3600) },
      },
      unstable_httpClientOptions: {
        adapter: async (config: SentRequest) => {
          requests.push(config);
          const next = replies.shift();
          if (!next) throw new Error(`Unexpected PayPal request: ${config.method} ${config.url}`);
          return {
            // The SDK reads the raw body itself, so hand it back as the wire would.
            data: JSON.stringify(next.body),
            status: next.status,
            statusText: "",
            headers: { "content-type": "application/json" },
            config,
          };
        },
      },
    }),
  );
});

afterEach(() => {
  setPayPalClient(null);
});

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

const usd = (value: string) => ({ currency_code: "USD", value });

/** Shape returned by GET /orders/{id} — always echoes each purchase unit's own amount. */
function orderDetail(status: string, units: { referenceId: string; amountValue: string; captureId?: string }[]) {
  return {
    id: "order-1",
    status,
    purchase_units: units.map((unit) => ({
      reference_id: unit.referenceId,
      amount: usd(unit.amountValue),
      payments: unit.captureId ? { captures: [{ id: unit.captureId, amount: usd(unit.amountValue) }] } : undefined,
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
    id: "order-1",
    status,
    purchase_units: units.map((unit) => ({
      reference_id: unit.referenceId,
      payments: {
        captures: [
          {
            id: unit.captureId,
            amount: usd(unit.amountValue),
            status: unit.captureStatus,
            status_details: unit.reason ? { reason: unit.reason } : undefined,
          },
        ],
      },
    })),
  };
}

const item = (name: string, value: string, sku: string) => ({ name: `Stay: ${name}`, unit_amount: usd(value), quantity: "1", sku });

describe("createPlanOrder", () => {
  it("follows the current Orders v2 guide: experience_context under payment_source.paypal, no deprecated application_context", async () => {
    reply({
      id: "order-1",
      status: "PAYER_ACTION_REQUIRED",
      links: [
        { rel: "self", href: "https://api.sandbox/v2/checkout/orders/order-1" },
        { rel: "payer-action", href: "https://sandbox.paypal.com/checkoutnow?token=order-1" },
      ],
    });

    const result = await createPlanOrder([offer("flight-1", 62000), offer("hotel-main", 95000)], {
      requestId: "tw-order-q",
      customId: "q",
      returnUrls: { returnUrl: "http://localhost:3000/checkout/return", cancelUrl: "http://localhost:3000/checkout/return?cancelled=1" },
    });

    expect(result).toEqual({ id: "order-1", approveUrl: "https://sandbox.paypal.com/checkoutnow?token=order-1", status: "PAYER_ACTION_REQUIRED" });
    expect(requests[0].method.toUpperCase()).toBe("POST");
    expect(requests[0].url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    expect(sentHeader(0, "PayPal-Request-Id")).toBe("tw-order-q");
    const createBody = sentBody(0);
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
        amount: { currency_code: "USD", value: "1570.00", breakdown: { item_total: usd("1570.00") } },
        items: [item("flight-1", "620.00", "flight-1"), item("hotel-main", "950.00", "hotel-main")],
        custom_id: "q",
      },
    ]);
  });

  it("sends no PayPal-Request-Id when the caller gave none", async () => {
    reply({ id: "o", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "x" }] });
    await createPlanOrder([offer("hotel-main", 95000)]);
    expect(sentHeader(0, "PayPal-Request-Id")).toBeUndefined();
  });

  it("still accepts a legacy approve link", async () => {
    reply({ id: "order-1", status: "CREATED", links: [{ rel: "approve", href: "https://sandbox/approve/order-1" }] });
    expect((await createPlanOrder([offer("hotel-main", 95000)])).approveUrl).toBe("https://sandbox/approve/order-1");
  });

  it("leaves free items out of the line items so PayPal's totals still match", async () => {
    reply({ id: "o", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "x" }] });
    await createPlanOrder([offer("hotel-main", 95000), offer("beach", 0)]);
    const unit = sentBody(0).purchase_units[0];
    expect(unit.items).toHaveLength(1);
    expect(unit.amount.breakdown.item_total.value).toBe(unit.amount.value);
  });

  it("gives an Onboarded Supplier's offer its own purchase unit and payee, matching PayPal's documented multi-payee shape", async () => {
    reply({ id: "order-2", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "x" }] });

    await createPlanOrder([offer("flight-sim", 600), offer("hotel-real", 400, "sb-r2jl753813374@personal.example.com")]);

    const units = sentBody(0).purchase_units;
    expect(units.map((u: { reference_id: string; amount: { value: string }; payee?: unknown }) => [u.reference_id, u.amount.value, u.payee])).toEqual([
      ["tripweave-bundle", "6.00", undefined],
      ["hotel-real", "4.00", { email_address: "sb-r2jl753813374@personal.example.com" }],
    ]);
  });

  it("omits the bundle unit entirely when every offer has its own payee", async () => {
    reply({ id: "order-3", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "x" }] });

    await createPlanOrder([offer("hotel-real", 400, "sb-r2jl753813374@personal.example.com")]);

    const units = sentBody(0).purchase_units;
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ reference_id: "hotel-real", payee: { email_address: "sb-r2jl753813374@personal.example.com" } });
  });

  it("turns PayPal's refusal into a short error without leaking its body", async () => {
    reply({ name: "UNPROCESSABLE_ENTITY", message: "The requested action could not be performed.", debug_id: "dbg-1", details: [{ issue: "PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING" }] }, 422);
    await expect(createPlanOrder([offer("hotel-main", 95000)])).rejects.toThrow("PayPal order creation failed.");
  });
});

describe("capturePlanOrder", () => {
  it("captures an approved single-unit order and returns its amount and capture id, from the capture response's own shape", async () => {
    reply(orderDetail("APPROVED", [{ referenceId: "tripweave-bundle", amountValue: "1570.00" }]));
    // Regression test: the real POST .../capture response has no top-level
    // purchase_units[].amount (see captureResponse's doc comment) — a mock
    // that always includes it (like orderDetail does) would hide this bug.
    reply(captureResponse("COMPLETED", [{ referenceId: "tripweave-bundle", amountValue: "1570.00", captureId: "capture-1", captureStatus: "COMPLETED" }]));

    const result = await capturePlanOrder("order-1");

    // The SDK leaves an empty query string ("…/order-1?") on GETs; PayPal ignores it.
    expect(requests.map((request) => [request.method.toUpperCase(), request.url.replace(/\?$/, "")])).toEqual([
      ["GET", "https://api-m.sandbox.paypal.com/v2/checkout/orders/order-1"],
      ["POST", "https://api-m.sandbox.paypal.com/v2/checkout/orders/order-1/capture"],
    ]);
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
    reply(orderDetail("CREATED", [{ referenceId: "tripweave-bundle", amountValue: "1570.00" }]));

    const result = await capturePlanOrder("order-1");

    expect(result.status).toBe("CREATED");
    expect(requests).toHaveLength(1);
  });

  it("does not re-capture an already completed order", async () => {
    reply(orderDetail("COMPLETED", [{ referenceId: "tripweave-bundle", amountValue: "1570.00", captureId: "capture-1" }]));

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
    expect(requests).toHaveLength(1);
  });

  it("reports every purchase unit from a multi-payee capture, matching PayPal's documented capture response shape", async () => {
    reply(
      orderDetail("APPROVED", [
        { referenceId: "flight-sim", amountValue: "6.00" },
        { referenceId: "hotel-real", amountValue: "4.00" },
      ]),
    );
    reply(
      captureResponse("COMPLETED", [
        { referenceId: "flight-sim", amountValue: "6.00", captureId: "capture-flight", captureStatus: "COMPLETED" },
        { referenceId: "hotel-real", amountValue: "4.00", captureId: "capture-hotel", captureStatus: "PENDING", reason: "PENDING_REVIEW" },
      ]),
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
    reply({ id: "refund-1", status: "COMPLETED" });

    const result = await refundCapture("capture-1", 9500, { requestId: "tw-refund-q-1" });

    expect(result).toEqual({ status: "COMPLETED", refundId: "refund-1" });
    expect(requests[0].method.toUpperCase()).toBe("POST");
    expect(requests[0].url).toBe("https://api-m.sandbox.paypal.com/v2/payments/captures/capture-1/refund");
    expect(sentHeader(0, "PayPal-Request-Id")).toBe("tw-refund-q-1");
    expect(sentBody(0)).toEqual({ amount: usd("95.00") });
  });

  it("passes an optional reason through as PayPal's note_to_payer", async () => {
    reply({ id: "refund-1", status: "COMPLETED" });

    await refundCapture("capture-1", 9500, { reason: "Supplier booking failed" });

    expect(sentBody(0)).toEqual({ amount: usd("95.00"), note_to_payer: "Supplier booking failed" });
  });

  it("fails loudly when PayPal refuses the refund", async () => {
    reply({ name: "UNPROCESSABLE_ENTITY", message: "Refund refused.", debug_id: "dbg-2", details: [{ issue: "CAPTURE_FULLY_REFUNDED" }] }, 422);
    await expect(refundCapture("capture-1", 9500)).rejects.toThrow("PayPal refund failed.");
  });
});

describe("capturePlanOrder declines", () => {
  it("reports INSTRUMENT_DECLINED as a recoverable status instead of throwing", async () => {
    reply(orderDetail("APPROVED", [{ referenceId: "tripweave-bundle", amountValue: "10.00" }]));
    reply({ name: "UNPROCESSABLE_ENTITY", message: "The instrument presented was declined.", details: [{ issue: "INSTRUMENT_DECLINED" }], debug_id: "abc" }, 422);

    const result = await capturePlanOrder("order-1", { requestId: "tw-capture-q" });

    expect(result.status).toBe("INSTRUMENT_DECLINED");
    expect(sentBody(1)).toEqual({});
    expect(sentHeader(1, "PayPal-Request-Id")).toBe("tw-capture-q");
  });

  it("throws on any other capture failure", async () => {
    reply(orderDetail("APPROVED", [{ referenceId: "tripweave-bundle", amountValue: "10.00" }]));
    reply({ name: "INTERNAL_SERVER_ERROR", message: "An internal server error occurred.", debug_id: "abc" }, 500);
    reply(orderDetail("APPROVED", [{ referenceId: "tripweave-bundle", amountValue: "10.00" }]));

    await expect(capturePlanOrder("order-1")).rejects.toThrow("PayPal capture failed.");
  });

  it("reports the capture when the call failed but PayPal did capture the money", async () => {
    reply(orderDetail("APPROVED", [{ referenceId: "tripweave-bundle", amountValue: "10.00" }]));
    reply({ name: "INTERNAL_SERVER_ERROR", message: "An internal server error occurred.", debug_id: "abc" }, 500);
    reply(orderDetail("COMPLETED", [{ referenceId: "tripweave-bundle", amountValue: "10.00", captureId: "capture-9" }]));

    const result = await capturePlanOrder("order-1");

    expect(result.status).toBe("COMPLETED");
    expect(result.purchaseUnits[0]).toMatchObject({ amountMinorUnits: 1000, captureId: "capture-9" });
  });
});

describe("createPlanOrder malformed replies", () => {
  it("refuses an order response with no status instead of assuming CREATED", async () => {
    reply({ id: "o", links: [{ rel: "payer-action", href: "x" }] });
    await expect(createPlanOrder([offer("hotel-main", 95000)])).rejects.toThrow("PayPal order returned no status.");
  });
});
