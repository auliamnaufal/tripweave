import { z } from "zod";
import { verifyWebhookSignature } from "@/features/payments/paypal";

export const runtime = "nodejs";

const webhookEventSchema = z.object({
  id: z.string().min(1),
  event_type: z.string().min(1),
  resource: z.unknown().optional(),
});

// The events this flow actually acts on — see ADR for the refund-on-booking-failure
// flow and the multi-payee split that PAYMENT.CAPTURE.REFUNDED confirms.
const HANDLED_EVENT_TYPES = new Set(["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.REFUNDED"]);

// ponytail: in-memory only, so a redeploy or a second instance forgets what it's
// seen. Add a webhook_events table (event id + received_at) if this needs to
// survive across instances/restarts.
const seenEventIds = new Set<string>();

export async function POST(request: Request) {
  let event: z.infer<typeof webhookEventSchema>;
  try {
    event = webhookEventSchema.parse(JSON.parse(await request.text()));
  } catch {
    return Response.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  const verified = await verifyWebhookSignature(
    {
      authAlgo: request.headers.get("paypal-auth-algo") ?? "",
      certUrl: request.headers.get("paypal-cert-url") ?? "",
      transmissionId: request.headers.get("paypal-transmission-id") ?? "",
      transmissionSig: request.headers.get("paypal-transmission-sig") ?? "",
      transmissionTime: request.headers.get("paypal-transmission-time") ?? "",
    },
    event,
  ).catch(() => false);

  if (!verified) {
    console.error(`[paypal webhook] rejected event ${event.id} (${event.event_type}) — signature did not verify`);
    return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  if (seenEventIds.has(event.id)) {
    console.log(`[paypal webhook] duplicate event ${event.id} (${event.event_type}) — already processed, skipping`);
    return Response.json({ received: true });
  }
  seenEventIds.add(event.id);

  if (HANDLED_EVENT_TYPES.has(event.event_type)) {
    console.log(`[paypal webhook] ${event.event_type} — event ${event.id}`, JSON.stringify(event.resource));
  } else {
    console.log(`[paypal webhook] unhandled event type ${event.event_type} — event ${event.id}`);
  }

  // Always 200 once verified, so PayPal doesn't retry — even an event type we
  // don't act on yet was still received and logged.
  return Response.json({ received: true });
}
