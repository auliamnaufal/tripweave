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
  | { referenceId: typeof BUNDLE_REFERENCE_ID; amountMinorUnits: number }
  | { referenceId: string; amountMinorUnits: number; payeeEmail: string };

/**
 * One purchase unit per Onboarded Supplier (its own payee, keyed by offer id),
 * plus one shared bundle unit for every other offer, summed under Tripweave's
 * own account (no payee field — same as today's default-payee behavior).
 */
function planPurchaseUnits(offers: readonly TravelOffer[]): PurchaseUnitPlan[] {
  let bundleMinorUnits = 0;
  const directUnits: PurchaseUnitPlan[] = [];

  for (const offer of offers) {
    if (offer.supplierPayeeEmail) {
      directUnits.push({
        referenceId: offer.id,
        amountMinorUnits: offer.costMinorUnits,
        payeeEmail: offer.supplierPayeeEmail,
      });
    } else {
      bundleMinorUnits += offer.costMinorUnits;
    }
  }

  if (bundleMinorUnits > 0 || directUnits.length === 0) {
    return [{ referenceId: BUNDLE_REFERENCE_ID, amountMinorUnits: bundleMinorUnits }, ...directUnits];
  }
  return directUnits;
}

// Matches PayPal's documented Orders v2 multi-payee purchase-unit shape —
// see docs/adr/0002-multi-payee-orders-pay-suppliers-directly.md, including
// its note that this is unit-tested but not yet verified in a live sandbox run.
function toWirePurchaseUnit(plan: PurchaseUnitPlan) {
  return {
    reference_id: plan.referenceId,
    amount: { currency_code: "USD", value: (plan.amountMinorUnits / 100).toFixed(2) },
    ...("payeeEmail" in plan ? { payee: { email_address: plan.payeeEmail } } : {}),
  };
}

function buildPurchaseUnits(offers: readonly TravelOffer[]) {
  return planPurchaseUnits(offers).map(toWirePurchaseUnit);
}

export async function createPlanOrder(offers: readonly TravelOffer[]): Promise<{ id: string; approveUrl: string }> {
  const token = await accessToken();
  const response = await fetch(`${baseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: buildPurchaseUnits(offers),
      // Without this, PayPal's hosted page shows a "Continue to review order"
      // button that tries to redirect back to a merchant return_url we never
      // set — with nowhere to go, it just reloads the same page instead of
      // completing. user_action: PAY_NOW finishes the transaction entirely on
      // PayPal's own page instead. See PayPal's own "Unintended PayPal
      // Checkout Flow" support article. We also never collect shipping for a
      // digital trip plan, so suppress that prompt too.
      application_context: {
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
      },
    }),
  });
  if (!response.ok) throw new Error("PayPal order creation failed.");
  const order = (await response.json()) as {
    id: string;
    links: { rel: string; href: string }[];
  };
  const approve = order.links.find((link) => link.rel === "approve");
  if (!approve) throw new Error("PayPal order has no approval link.");
  return { id: order.id, approveUrl: approve.href };
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

export async function capturePlanOrder(orderId: string): Promise<PlanOrderStatus> {
  const existing = await getPlanOrder(orderId);
  if (existing.status === "COMPLETED") return existing;
  const token = await accessToken();
  const response = await fetch(`${baseUrl()}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) throw new Error("PayPal capture failed.");
  return readOrderDetail((await response.json()) as OrderDetail);
}

export async function refundCapture(
  captureId: string,
  amountMinorUnits: number,
  reason?: string,
): Promise<{ status: string; refundId: string }> {
  const token = await accessToken();
  const response = await fetch(`${baseUrl()}/v2/payments/captures/${captureId}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: { currency_code: "USD", value: (amountMinorUnits / 100).toFixed(2) },
      ...(reason ? { note_to_payer: reason } : {}),
    }),
  });
  if (!response.ok) throw new Error("PayPal refund failed.");
  const result = (await response.json()) as { id: string; status: string };
  return { status: result.status, refundId: result.id };
}

/** The PAYPAL-* transmission headers PayPal sends on every webhook delivery. */
export type WebhookTransmissionHeaders = {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
};

export async function verifyWebhookSignature(
  headers: WebhookTransmissionHeaders,
  event: unknown,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PayPal webhook is not configured.");
  const token = await accessToken();
  const response = await fetch(`${baseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: headers.authAlgo,
      cert_url: headers.certUrl,
      transmission_id: headers.transmissionId,
      transmission_sig: headers.transmissionSig,
      transmission_time: headers.transmissionTime,
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });
  if (!response.ok) throw new Error("PayPal webhook verification failed.");
  const result = (await response.json()) as { verification_status: string };
  return result.verification_status === "SUCCESS";
}
