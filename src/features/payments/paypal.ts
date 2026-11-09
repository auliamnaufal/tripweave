import { Buffer } from "node:buffer";

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

export async function createPlanOrder(amountMinorUnits: number): Promise<{ id: string; approveUrl: string }> {
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
            value: (amountMinorUnits / 100).toFixed(2),
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

type OrderDetail = {
  status: string;
  purchase_units?: {
    amount?: { value?: string };
    payments?: { captures?: { id: string }[] };
  }[];
};

function readOrderDetail(order: OrderDetail): { status: string; amountMinorUnits: number; captureId?: string } {
  const unit = order.purchase_units?.[0];
  const amountMinorUnits = Math.round(parseFloat(unit?.amount?.value ?? "0") * 100);
  const captureId = unit?.payments?.captures?.[0]?.id;
  return { status: order.status, amountMinorUnits, captureId };
}

export async function getPlanOrder(
  orderId: string,
): Promise<{ status: string; amountMinorUnits: number; captureId?: string }> {
  const token = await accessToken();
  const response = await fetch(`${baseUrl()}/v2/checkout/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("PayPal order lookup failed.");
  return readOrderDetail((await response.json()) as OrderDetail);
}

export async function capturePlanOrder(
  orderId: string,
): Promise<{ status: string; amountMinorUnits: number; captureId?: string }> {
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
    }),
  });
  if (!response.ok) throw new Error("PayPal refund failed.");
  const result = (await response.json()) as { id: string; status: string };
  return { status: result.status, refundId: result.id };
}
