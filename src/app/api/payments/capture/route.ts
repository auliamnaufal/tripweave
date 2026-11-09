import { z } from "zod";
import { BUNDLE_REFERENCE_ID, capturePlanOrder, refundCapture, type PurchaseUnitCapture } from "@/features/payments/paypal";
import { toTravelOffer, travelOfferSchema, type TravelOffer } from "@/features/planner/travelOffer";
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
  // Real money paid straight to an Onboarded Supplier's own PayPal account, as
  // its own purchase unit on this same order. Reported honestly: PayPal's own
  // capture status for that unit, which can land PENDING/PENDING_REVIEW rather
  // than COMPLETED (see docs/research/live-sandbox-third-party-payee-test-2026-11-09.md).
  | { kind: "direct-payment"; offerId: string; status: string; reason?: string; amountMinorUnits: number }
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
        // Everything after this is Tripweave (or, for an Onboarded Supplier's
        // own purchase unit, that supplier directly) spending money already captured.
        const captured = await capturePlanOrder(input.orderId);
        const amountMinorUnits = captured.purchaseUnits.reduce((sum, unit) => sum + unit.amountMinorUnits, 0);
        controller.enqueue(ndjsonLine({ kind: "payment", status: captured.status, amountMinorUnits }));

        if (captured.status !== "COMPLETED") {
          controller.enqueue(ndjsonLine({ kind: "error", message: "Payment was not completed." }));
          return;
        }

        // An Onboarded Supplier's offer was its own purchase unit, paid directly;
        // everything else summed into Tripweave's own bundle unit and still needs
        // a Supplier Booking. See GLOSSARY.md and docs/adr/0002.
        const needsBooking = input.offers.filter((offer) => !offer.supplierPayeeEmail);
        const alreadyPaidDirect = input.offers.filter((offer) => offer.supplierPayeeEmail);

        const unitByReferenceId = new Map<string, PurchaseUnitCapture>(
          captured.purchaseUnits.map((unit) => [unit.referenceId, unit]),
        );
        const bundleUnit = unitByReferenceId.get(BUNDLE_REFERENCE_ID);
        const bundleCapturedAmount = bundleUnit?.amountMinorUnits ?? 0;

        // The offers must reconcile against what PayPal actually captured, per
        // purchase unit — not just against the order's grand total, which now
        // mixes money that's Tripweave's to book with money that already went
        // straight to a supplier and isn't Tripweave's at all.
        const needsBookingTotal = needsBooking.reduce((sum, offer) => sum + offer.costMinorUnits, 0);
        const directAmountMismatch = alreadyPaidDirect.some(
          (offer) => unitByReferenceId.get(offer.id)?.amountMinorUnits !== offer.costMinorUnits,
        );
        if (needsBookingTotal !== bundleCapturedAmount || directAmountMismatch) {
          controller.enqueue(
            ndjsonLine({ kind: "error", message: "The paid amount does not match this itinerary." }),
          );
          return;
        }

        for (const offer of alreadyPaidDirect) {
          const unit = unitByReferenceId.get(offer.id);
          if (!unit) continue;
          controller.enqueue(
            ndjsonLine({
              kind: "direct-payment",
              offerId: offer.id,
              status: unit.captureStatus ?? captured.status,
              reason: unit.captureStatusReason,
              amountMinorUnits: unit.amountMinorUnits,
            }),
          );
        }

        if (needsBooking.length === 0) {
          controller.enqueue(
            ndjsonLine({
              kind: "summary",
              results: [],
              note: "Every offer was paid directly to its own supplier. No simulated booking was needed.",
              bookedMinorUnits: 0,
              refundedMinorUnits: 0,
            }),
          );
          return;
        }

        if (!bundleUnit?.captureId) {
          throw new Error("Capture succeeded but returned no capture id to refund against.");
        }

        const bookingSteps = streamBookingAgent(needsBooking, input.forceFailureOfferId);
        let step = await bookingSteps.next();
        while (!step.done) {
          controller.enqueue(ndjsonLine(step.value));
          step = await bookingSteps.next();
        }
        const { results, note } = step.value;

        const { refunds, bookedMinorUnits, refundedMinorUnits } = reconcileBookings(
          needsBooking,
          results,
          bundleCapturedAmount,
        );

        for (const refund of refunds) {
          const result = await refundCapture(bundleUnit.captureId, refund.amountMinorUnits);
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
