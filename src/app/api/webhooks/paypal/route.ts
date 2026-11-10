import { readWebhookHeaders, verifyWebhookSignature } from "@/features/payments/paypal";
import { handlePayPalEvent, type PayPalWebhookEvent } from "@/features/payments/webhook";
import {
  getQuote,
  listBookings,
  markWebhookProcessed,
  recordWebhookEvent,
  setQuoteStatus,
  transitionQuote,
} from "@/features/quotes/quoteStore";

export const runtime = "nodejs";

/**
 * PayPal webhook receiver. Order of operations matters:
 * 1. Verify with PayPal that the delivery is genuine. Unverified → 400, never processed.
 * 2. Record it by event id. A repeat delivery → 200 and stop (PayPal retries until 2xx).
 * 3. Act on it, then mark it processed.
 * A failure in 1–3 answers 5xx so PayPal redelivers later.
 */
export async function POST(request: Request) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error("PAYPAL_WEBHOOK_ID is not set; refusing webhook deliveries");
    return Response.json({ error: "Webhooks are not configured." }, { status: 503 });
  }

  const headers = readWebhookHeaders(request.headers);
  let event: PayPalWebhookEvent;
  try {
    event = (await request.json()) as PayPalWebhookEvent;
  } catch {
    return Response.json({ error: "Invalid body." }, { status: 400 });
  }
  if (!headers || typeof event?.id !== "string" || typeof event?.event_type !== "string") {
    return Response.json({ error: "Not a PayPal webhook." }, { status: 400 });
  }

  let genuine: boolean;
  try {
    genuine = await verifyWebhookSignature(headers, event, webhookId);
  } catch (error) {
    console.error("webhook verification unavailable", error);
    return Response.json({ error: "Try again later." }, { status: 503 });
  }
  if (!genuine) {
    console.warn("rejected a webhook that failed PayPal verification", event.id);
    return Response.json({ error: "Verification failed." }, { status: 400 });
  }

  try {
    const first = await recordWebhookEvent({
      id: event.id,
      eventType: event.event_type,
      resourceId: event.resource?.id ?? null,
      payload: event,
    });
    if (!first) return Response.json({ ok: true, duplicate: true });

    const { outcome, quoteId } = await handlePayPalEvent(event, { getQuote, listBookings, transitionQuote, setQuoteStatus });
    await markWebhookProcessed(event.id, outcome, quoteId);
    console.info(`paypal webhook ${event.event_type} ${event.id} -> ${outcome}${quoteId ? ` (quote ${quoteId})` : ""}`);
    return Response.json({ ok: true, outcome });
  } catch (error) {
    console.error("webhook processing failed", event.id, error);
    return Response.json({ error: "Try again later." }, { status: 500 });
  }
}
