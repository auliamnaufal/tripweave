import { z } from "zod";
import { createPlanOrder } from "@/features/payments/paypal";
import { toTravelOffer, travelOfferSchema, type TravelOffer } from "@/features/planner/travelOffer";

export const runtime = "nodejs";

const orderRequestSchema = z.object({ offers: z.array(travelOfferSchema).min(1) });

export async function POST(request: Request) {
  let offers: TravelOffer[];
  try {
    offers = orderRequestSchema.parse(await request.json()).offers.map(toTravelOffer);
  } catch {
    return Response.json({ error: "Invalid order request." }, { status: 400 });
  }

  // The amount is always derived from the paid-for offers, never taken as a raw
  // number from the client — this is what later lets the capture route trust
  // that "sum of these offers" really is "what PayPal captured".
  const amountMinorUnits = offers.reduce((sum, offer) => sum + offer.costMinorUnits, 0);

  try {
    const { id, approveUrl } = await createPlanOrder(offers);
    return Response.json({ orderId: id, approveUrl, amountMinorUnits });
  } catch {
    return Response.json({ error: "Payment is unavailable right now." }, { status: 503 });
  }
}
