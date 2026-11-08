import { Buffer } from "node:buffer";

export const PLAN_PRICE_MINOR_UNITS = 500;

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

export async function createPlanOrder(): Promise<{ id: string; approveUrl: string }> {
  const token = await accessToken();
  const response = await fetch(`${baseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: (PLAN_PRICE_MINOR_UNITS / 100).toFixed(2),
          },
        },
      ],
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

export async function getPlanOrder(orderId: string): Promise<{ status: string }> {
  const token = await accessToken();
  const response = await fetch(`${baseUrl()}/v2/checkout/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("PayPal order lookup failed.");
  const order = (await response.json()) as { status: string };
  return { status: order.status };
}

export async function capturePlanOrder(orderId: string): Promise<{ status: string }> {
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
  const result = (await response.json()) as { status: string };
  return { status: result.status };
}
