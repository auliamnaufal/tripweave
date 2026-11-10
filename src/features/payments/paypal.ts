import { Buffer } from "node:buffer";
import type { TravelOffer } from "@/features/planner/travelOffer";

export const BUNDLE_REFERENCE_ID = "tripweave-bundle";

function baseUrl(): string {
  return process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function accessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PayPal is not configured.");
  const response = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("PayPal authentication failed.");
  const token = (await response.json()) as { access_token: string };
  return token.access_token;
}

/** One purchase unit's plan: Tripweave's own bundle, or an Onboarded Supplier's own payee. */
type PurchaseUnitPlan =
  | { referenceId: typeof BUNDLE_REFERENCE_ID; amountMinorUnits: number; offers: TravelOffer[] }
  | { referenceId: string; amountMinorUnits: number; payeeEmail: string; offers: TravelOffer[] };

/**
 * One purchase unit per Onboarded Supplier (its own payee, keyed by offer id),
 * plus one shared bundle unit for every other offer, summed under Tripweave's
 * own account (no payee field — same as today's default-payee behavior).
 */
function planPurchaseUnits(offers: readonly TravelOffer[]): PurchaseUnitPlan[] {
  let bundleMinorUnits = 0;
  const bundleOffers: TravelOffer[] = [];
  const directUnits: PurchaseUnitPlan[] = [];

  for (const offer of offers) {
    if (offer.supplierPayeeEmail) {
      directUnits.push({
        referenceId: offer.id,
        amountMinorUnits: offer.costMinorUnits,
        payeeEmail: offer.supplierPayeeEmail,
        offers: [offer],
      });
    } else {
      bundleMinorUnits += offer.costMinorUnits;
      bundleOffers.push(offer);
    }
  }

  if (bundleMinorUnits > 0 || directUnits.length === 0) {
    return [{ referenceId: BUNDLE_REFERENCE_ID, amountMinorUnits: bundleMinorUnits, offers: bundleOffers }, ...directUnits];
  }
  return directUnits;
}

const usd = (minor: number) => ({ currency_code: "USD", value: (minor / 100).toFixed(2) });

const KIND_LABEL: Record<TravelOffer["productKind"], string> = { flight: "Flight", hotel: "Stay", activity: "Activity" };

/**
 * Line items, so the buyer sees what they're paying for on PayPal's review
 * page. PayPal requires `amount.breakdown.item_total` to equal the sum of
 * `unit_amount × quantity`, which holds by construction here. Free items are
 * left out: PayPal rejects a zero `unit_amount` on some accounts, and they add
 * nothing to the total.
 */
function wireItems(offers: readonly TravelOffer[]) {
  return offers
    .filter((offer) => offer.costMinorUnits > 0)
    .map((offer) => ({
      name: `${KIND_LABEL[offer.productKind]}: ${offer.title}`.slice(0, 127),
      quantity: "1",
      unit_amount: usd(offer.costMinorUnits),
      sku: offer.id.slice(0, 127),
    }));
}

// Payee shape follows PayPal's documented Orders v2 multi-payee shape; see
// docs/adr/0002-multi-payee-orders-pay-suppliers-directly.md.
function toWirePurchaseUnit(plan: PurchaseUnitPlan, customId?: string) {
  const items = wireItems(plan.offers);
  return {
    reference_id: plan.referenceId,
    ...(plan.referenceId === BUNDLE_REFERENCE_ID ? { description: "Tripweave trip: flights, stay and activities" } : {}),
    amount: {
      ...usd(plan.amountMinorUnits),
      ...(items.length ? { breakdown: { item_total: usd(plan.amountMinorUnits) } } : {}),
    },
    ...(items.length ? { items } : {}),
    ...("payeeEmail" in plan ? { payee: { email_address: plan.payeeEmail } } : {}),
    ...(customId ? { custom_id: customId } : {}),
  };
}

function buildPurchaseUnits(offers: readonly TravelOffer[], customId?: string) {
  return planPurchaseUnits(offers).map((plan) => toWirePurchaseUnit(plan, customId));
}

/**
 * `requestId` is sent as PayPal's `PayPal-Request-Id` header. PayPal replays
 * the first response for a repeated id instead of creating a second order,
 * capture or refund, so a retried request (double click, reload, network
 * retry) can't double-charge or double-refund. Callers derive it from the
 * plan quote id.
 */
export type PayPalCallOptions = { requestId?: string };

function jsonHeaders(token: string, requestId?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
  };
}

/** Where PayPal sends the buyer after approving or cancelling on its own page. */
export type ReturnUrls = { returnUrl: string; cancelUrl: string };

/**
 * Creates the order the way PayPal's Orders v2 guide documents it today:
 * buyer-experience settings live in `payment_source.paypal.experience_context`
 * (top-level `application_context` is deprecated and its fields are ignored
 * when both are present). With a payment source set, PayPal answers
 * `PAYER_ACTION_REQUIRED` and the buyer link is `rel: "payer-action"`.
 *
 * - `user_action: PAY_NOW`: the final amount is known, so PayPal shows "Pay Now"
 *   and approval completes on PayPal's page.
 * - `shipping_preference: NO_SHIPPING`: nothing is shipped.
 * - `return_url` / `cancel_url`: PayPal redirects the buyer there afterwards.
 * - `customId` tags every purchase unit, so a webhook event can be traced back to its plan quote.
 */
export async function createPlanOrder(
  offers: readonly TravelOffer[],
  options: PayPalCallOptions & { customId?: string; returnUrls?: ReturnUrls } = {},
): Promise<{ id: string; approveUrl: string; status: string }> {
  const token = await accessToken();
  const response = await fetch(`${baseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: jsonHeaders(token, options.requestId),
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: buildPurchaseUnits(offers, options.customId),
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Tripweave",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            ...(options.returnUrls
              ? { return_url: options.returnUrls.returnUrl, cancel_url: options.returnUrls.cancelUrl }
              : {}),
          },
        },
      },
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { name?: string; debug_id?: string; details?: { issue?: string }[] } | null;
    // debug_id is what PayPal support asks for; it carries no payer data.
    console.error("paypal create order failed", response.status, body?.name, body?.details?.[0]?.issue, body?.debug_id);
    throw new Error("PayPal order creation failed.");
  }
  const order = (await response.json()) as {
    id: string;
    status: string;
    links: { rel: string; href: string }[];
  };
  const approve = order.links.find((link) => link.rel === "payer-action") ?? order.links.find((link) => link.rel === "approve");
  if (!approve) throw new Error("PayPal order has no approval link.");
  return { id: order.id, approveUrl: approve.href, status: order.status };
}

type OrderDetail = {
  status: string;
  purchase_units?: {
    reference_id?: string;
    amount?: { value?: string };
    payments?: {
      captures?: {
        id: string;
        amount?: { value?: string };
        status?: string;
        status_details?: { reason?: string };
      }[];
    };
  }[];
};

/** One purchase unit's outcome: what it cost, who captured it, and (for a real third-party payee) whether that capture is actually done yet. */
export type PurchaseUnitCapture = {
  referenceId: string;
  amountMinorUnits: number;
  captureId?: string;
  captureStatus?: string;
  captureStatusReason?: string;
};

export type PlanOrderStatus = {
  status: string;
  purchaseUnits: PurchaseUnitCapture[];
};

// PayPal's GET /orders/{id} response echoes each purchase unit's own amount
// (the order's original amount), but the POST .../capture response does not —
// it only carries the amount inside that unit's payments.captures[0].amount.
// Prefer each unit's own capture amount whenever one exists: it's what was
// actually captured, and the only value present right after a capture call.
function readOrderDetail(order: OrderDetail): PlanOrderStatus {
  const purchaseUnits = (order.purchase_units ?? []).map((unit) => {
    const capture = unit.payments?.captures?.[0];
    const amountValue = capture?.amount?.value ?? unit.amount?.value ?? "0";
    return {
      referenceId: unit.reference_id ?? BUNDLE_REFERENCE_ID,
      amountMinorUnits: Math.round(parseFloat(amountValue) * 100),
      captureId: capture?.id,
      captureStatus: capture?.status,
      captureStatusReason: capture?.status_details?.reason,
    };
  });
  return { status: order.status, purchaseUnits };
}

export async function getPlanOrder(orderId: string): Promise<PlanOrderStatus> {
  const token = await accessToken();
  const response = await fetch(`${baseUrl()}/v2/checkout/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("PayPal order lookup failed.");
  return readOrderDetail((await response.json()) as OrderDetail);
}

export async function capturePlanOrder(orderId: string, options: PayPalCallOptions = {}): Promise<PlanOrderStatus> {
  const existing = await getPlanOrder(orderId);
  // Only an APPROVED order can be captured. Anything else (already COMPLETED,
  // or not yet approved by the buyer) is reported as is, without a capture call.
  if (existing.status !== "APPROVED") return existing;
  const token = await accessToken();
  const response = await fetch(`${baseUrl()}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: jsonHeaders(token, options.requestId),
    body: "{}",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { name?: string; debug_id?: string; details?: { issue?: string }[] } | null;
    const issue = body?.details?.[0]?.issue;
    console.error("paypal capture failed", response.status, body?.name, issue, body?.debug_id);
    // Recoverable per PayPal's guide: the buyer's funding source was declined,
    // so they go back to PayPal to pick another one. Nothing was captured.
    if (issue === "INSTRUMENT_DECLINED") return { status: "INSTRUMENT_DECLINED", purchaseUnits: existing.purchaseUnits };
    throw new Error("PayPal capture failed.");
  }
  return readOrderDetail((await response.json()) as OrderDetail);
}

/** The five headers PayPal signs every webhook delivery with. */
export type WebhookHeaders = {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
};

export function readWebhookHeaders(headers: Headers): WebhookHeaders | null {
  const get = (name: string) => headers.get(name) ?? "";
  const read = {
    transmissionId: get("paypal-transmission-id"),
    transmissionTime: get("paypal-transmission-time"),
    transmissionSig: get("paypal-transmission-sig"),
    certUrl: get("paypal-cert-url"),
    authAlgo: get("paypal-auth-algo"),
  };
  return Object.values(read).every(Boolean) ? read : null;
}

/**
 * Asks PayPal itself whether a delivery is genuine
 * (POST /v1/notifications/verify-webhook-signature). Simpler and safer than
 * checking the certificate chain locally. `webhookEvent` must be the parsed
 * body exactly as received.
 */
export async function verifyWebhookSignature(
  headers: WebhookHeaders,
  webhookEvent: unknown,
  webhookId: string,
): Promise<boolean> {
  const token = await accessToken();
  const response = await fetch(`${baseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify({
      auth_algo: headers.authAlgo,
      cert_url: headers.certUrl,
      transmission_id: headers.transmissionId,
      transmission_sig: headers.transmissionSig,
      transmission_time: headers.transmissionTime,
      webhook_id: webhookId,
      webhook_event: webhookEvent,
    }),
  });
  if (!response.ok) throw new Error("PayPal webhook verification is unavailable.");
  const result = (await response.json()) as { verification_status?: string };
  return result.verification_status === "SUCCESS";
}

export async function refundCapture(
  captureId: string,
  amountMinorUnits: number,
  options: PayPalCallOptions & { reason?: string } = {},
): Promise<{ status: string; refundId: string }> {
  const token = await accessToken();
  const response = await fetch(`${baseUrl()}/v2/payments/captures/${captureId}/refund`, {
    method: "POST",
    headers: jsonHeaders(token, options.requestId),
    body: JSON.stringify({
      amount: { currency_code: "USD", value: (amountMinorUnits / 100).toFixed(2) },
      ...(options.reason ? { note_to_payer: options.reason } : {}),
    }),
  });
  if (!response.ok) throw new Error("PayPal refund failed.");
  const result = (await response.json()) as { id: string; status: string };
  return { status: result.status, refundId: result.id };
}
