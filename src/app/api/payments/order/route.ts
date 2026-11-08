import { createPlanOrder, PLAN_PRICE_MINOR_UNITS } from "@/features/payments/paypal";

export const runtime = "nodejs";

export async function POST() {
  try {
    const { id, approveUrl } = await createPlanOrder();
    return Response.json({ orderId: id, approveUrl, planPriceMinorUnits: PLAN_PRICE_MINOR_UNITS });
  } catch {
    return Response.json({ error: "Payment is unavailable right now." }, { status: 503 });
  }
}
