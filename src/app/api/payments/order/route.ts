import { z } from "zod";
import { createPlanOrder } from "@/features/payments/paypal";
import { canAccess, demoModeEnabled, quoteTotal, requestIds, withDemoPayee } from "@/features/quotes/quote";
import { getQuote, markOrdered, saveQuote } from "@/features/quotes/quoteStore";
import { authedUser } from "@/lib/supabase/authedUser";
import { assertBookable } from "@/features/suppliers/registry";
import { repriceQuote, type QuoteRepricing } from "@/features/quotes/reprice";
import { parseTripBrief } from "@/features/planner/tripBrief";
import { buildItinerary } from "@/features/planner/planner";
import { itineraryPlanSchema } from "@/features/planner/travelOffer";

const usd = (minor: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(minor / 100);

export const runtime = "nodejs";

// The browser names a quote; it never sends offers, prices or payees. Those
// come only from the server-held snapshot /api/plan saved.
const orderRequestSchema = z.object({
  quoteId: z.string().uuid(),
  // DEMO_MODE only: pay one non-flight offer straight to a sandbox account.
  demoDirectPayee: z.object({ offerId: z.string().min(1), email: z.string().email() }).optional(),
});

/**
 * Where PayPal sends the buyer back. APP_BASE_URL pins it in deployments
 * (behind a proxy the request origin can be internal); locally the request's
 * own origin is right.
 */
function returnUrls(request: Request) {
  const base = (process.env.APP_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
  return { returnUrl: `${base}/checkout/return`, cancelUrl: `${base}/checkout/return?cancelled=1` };
}

const notFound = () => Response.json({ error: "This plan was not found. Please plan the trip again." }, { status: 404 });

export async function POST(request: Request) {
  let input: z.infer<typeof orderRequestSchema>;
  try {
    input = orderRequestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid order request." }, { status: 400 });
  }
  if (input.demoDirectPayee && !demoModeEnabled()) {
    return Response.json({ error: "Direct supplier payees are only available in demo mode." }, { status: 400 });
  }

  try {
    const { user } = await authedUser();
    const quote = await getQuote(input.quoteId);
    if (!quote || !canAccess(quote, user?.id)) return notFound();

    // Idempotent: asking again for an already-ordered quote returns the same order.
    if (quote.status === "ordered" && quote.paypalOrderId && quote.approveUrl) {
      return Response.json({ orderId: quote.paypalOrderId, approveUrl: quote.approveUrl, amountMinorUnits: quote.totalMinorUnits });
    }
    if (quote.status !== "quoted") {
      return Response.json({ error: "This plan has already been paid." }, { status: 409 });
    }
    try {
      // The registry already keeps deeplink offers out of every quote; this is
      // the last check before money is asked for.
      assertBookable(quote.offers);
    } catch (error) {
      console.error("quote holds an offer that can't be booked", quote.id, error);
      return Response.json({ error: "Part of this plan can't be booked through Tripweave. Please plan again." }, { status: 409 });
    }

    // Re-check every price with its supplier right before asking for money.
    // This also revives an expired quote whose prices still hold.
    let repricing: QuoteRepricing;
    try {
      repricing = await repriceQuote(quote.offers);
    } catch (error) {
      console.error("reprice failed", quote.id, error);
      return Response.json(
        { error: "We couldn't confirm current prices with the suppliers. Try again in a moment.", code: "reprice-unavailable" },
        { status: 503 },
      );
    }
    if (repricing.status === "unavailable") {
      return Response.json(
        { error: `${repricing.reason} Plan the trip again to get current options.`, code: "quote-unavailable", offerId: repricing.offerId },
        { status: 409 },
      );
    }
    if (repricing.status === "changed") {
      // Never charge a new price silently: save it as a fresh quote and let the
      // traveller approve the new total first.
      const brief = parseTripBrief(quote.brief);
      const plan = buildItinerary(brief, repricing.offers);
      const newQuoteId = await saveQuote({ userId: quote.userId, brief, offers: plan.offers });
      return Response.json(
        {
          error: `Prices changed since you planned: the total is now ${usd(repricing.totalMinorUnits)} (was ${usd(repricing.previousTotalMinorUnits)}).`,
          code: "quote-repriced",
          quoteId: newQuoteId,
          plan: itineraryPlanSchema.parse(plan),
          previousTotalMinorUnits: repricing.previousTotalMinorUnits,
        },
        { status: 409 },
      );
    }

    let offers = repricing.offers;
    if (input.demoDirectPayee) {
      try {
        offers = withDemoPayee(offers, input.demoDirectPayee);
      } catch (error) {
        return Response.json({ error: (error as Error).message }, { status: 400 });
      }
    }

    const order = await createPlanOrder(offers, {
      requestId: requestIds.order(quote.id),
      customId: quote.id,
      returnUrls: returnUrls(request),
    });
    const won = await markOrdered(quote.id, { paypalOrderId: order.id, approveUrl: order.approveUrl, offers });
    if (!won) {
      // A concurrent request ordered first. PayPal-Request-Id made both calls
      // return the same order, so the stored one is the one to hand back.
      const current = await getQuote(quote.id);
      if (current?.paypalOrderId && current.approveUrl) {
        return Response.json({ orderId: current.paypalOrderId, approveUrl: current.approveUrl, amountMinorUnits: current.totalMinorUnits });
      }
    }
    return Response.json({ orderId: order.id, approveUrl: order.approveUrl, amountMinorUnits: quoteTotal(offers) });
  } catch (error) {
    console.error("order creation failed", error);
    return Response.json({ error: "Payment is unavailable right now." }, { status: 503 });
  }
}
