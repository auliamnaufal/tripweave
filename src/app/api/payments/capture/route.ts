import { z } from "zod";
import { capturePlanOrder, refundCapture } from "@/features/payments/paypal";
import { travelOfferSchema, type TravelOffer, type TravelOfferView } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";
import { reconcileBookings } from "@/features/suppliers/booking";
import {
  streamBookingAgent,
  type BookingAgentOutput,
  type BookingStreamEvent,
} from "@/features/agent/bookingAgent";

export const runtime = "nodejs";

const captureRequestSchema = z.object({
  orderId: z.string().min(1),
  offers: z.array(travelOfferSchema).min(1),
  forceFailureOfferId: z.string().optional(),
});

export type CaptureStreamEvent =
  | BookingStreamEvent
  | { kind: "payment"; status: string; amountMinorUnits: number }
  | { kind: "refund"; offerId: string; amountMinorUnits: number; status: string }
  | {
      kind: "summary";
      results: BookingAgentOutput["results"];
      note: string;
      bookedMinorUnits: number;
      refundedMinorUnits: number;
    }
  | { kind: "error"; message: string };

function ndjsonLine(event: CaptureStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

function toTravelOffer(view: TravelOfferView): TravelOffer {
  return {
    ...view,
    startsAt: zonedDateTime(view.startsAt),
    endsAt: zonedDateTime(view.endsAt),
    costMinorUnits: minorUnits(view.costMinorUnits),
  };
}

export async function POST(request: Request) {
  let input: { orderId: string; offers: TravelOffer[]; forceFailureOfferId?: string };
  try {
    const parsed = captureRequestSchema.parse(await request.json());
    input = { ...parsed, offers: parsed.offers.map(toTravelOffer) };
  } catch {
    return Response.json({ error: "Invalid payment request." }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // The one and only moment the traveler's PayPal account is touched.
        // Everything after this is Tripweave spending money it already has.
        const captured = await capturePlanOrder(input.orderId);
        controller.enqueue(
          ndjsonLine({ kind: "payment", status: captured.status, amountMinorUnits: captured.amountMinorUnits }),
        );

        if (captured.status !== "COMPLETED") {
          controller.enqueue(ndjsonLine({ kind: "error", message: "Payment was not completed." }));
          return;
        }
        if (!captured.captureId) {
          throw new Error("Capture succeeded but returned no capture id to refund against.");
        }

        const offersTotal = input.offers.reduce((sum, offer) => sum + offer.costMinorUnits, 0);
        if (offersTotal !== captured.amountMinorUnits) {
          controller.enqueue(
            ndjsonLine({ kind: "error", message: "The paid amount does not match this itinerary." }),
          );
          return;
        }

        const bookingSteps = streamBookingAgent(input.offers, input.forceFailureOfferId);
        let step = await bookingSteps.next();
        while (!step.done) {
          controller.enqueue(ndjsonLine(step.value));
          step = await bookingSteps.next();
        }
        const { results, note } = step.value;

        const { refunds, bookedMinorUnits, refundedMinorUnits } = reconcileBookings(
          input.offers,
          results,
          captured.amountMinorUnits,
        );

        for (const refund of refunds) {
          const result = await refundCapture(captured.captureId, refund.amountMinorUnits);
          controller.enqueue(
            ndjsonLine({
              kind: "refund",
              offerId: refund.offerId,
              amountMinorUnits: refund.amountMinorUnits,
              status: result.status,
            }),
          );
        }

        controller.enqueue(ndjsonLine({ kind: "summary", results, note, bookedMinorUnits, refundedMinorUnits }));
      } catch (error) {
        console.error("booking failed", error);
        controller.enqueue(ndjsonLine({ kind: "error", message: "Booking could not be completed." }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
