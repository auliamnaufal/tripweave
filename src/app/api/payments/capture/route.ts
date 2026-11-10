import { z } from "zod";
import { BUNDLE_REFERENCE_ID, capturePlanOrder, refundCapture, type PurchaseUnitCapture } from "@/features/payments/paypal";
import { reconcileBookings } from "@/features/suppliers/booking";
import { canAccess, demoFailureOfferId, requestIds, type BookingRecord, type PlanQuote } from "@/features/quotes/quote";
import { getQuoteByOrderId, listBookings, setQuoteStatus, transitionQuote, writeBookings } from "@/features/quotes/quoteStore";
import { authedUser } from "@/lib/supabase/authedUser";
import { runBookings, type BookingRunOutput, type BookingStreamEvent } from "@/features/suppliers/bookingExecutor";

export const runtime = "nodejs";

// The browser names the PayPal order. What was paid for, and what to book, is
// read from the plan quote that order was created from.
const captureRequestSchema = z.object({
  orderId: z.string().min(1),
  // Honored only when DEMO_MODE=true, so a traveller can't trigger refunds at will.
  forceFailureOfferId: z.string().optional(),
  // Descriptive only, for the receipt row. Never used for money.
  destId: z.string().optional(),
  title: z.string().optional(),
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
      results: BookingRunOutput["results"];
      note: string;
      bookedMinorUnits: number;
      refundedMinorUnits: number;
    }
  | { kind: "error"; message: string };

function ndjsonLine(event: CaptureStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

function ndjsonResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}

/** Rebuilds the final outcome from stored bookings, for a capture that already ran. */
function replayEvents(quote: PlanQuote, bookings: readonly BookingRecord[]): CaptureStreamEvent[] {
  const events: CaptureStreamEvent[] = [{ kind: "payment", status: "COMPLETED", amountMinorUnits: quote.totalMinorUnits }];
  const results: BookingRunOutput["results"] = [];
  let bookedMinorUnits = 0;
  let refundedMinorUnits = 0;
  for (const booking of bookings) {
    if (booking.status === "booked") {
      results.push({ offerId: booking.offerId, status: "booked", bookingRef: booking.bookingRef ?? "" });
      bookedMinorUnits += booking.amountMinorUnits;
    } else if (booking.status === "failed") {
      results.push({ offerId: booking.offerId, status: "failed", reason: booking.failureReason ?? "Could not be booked." });
      if (booking.refundStatus) {
        refundedMinorUnits += booking.amountMinorUnits;
        events.push({ kind: "refund", offerId: booking.offerId, amountMinorUnits: booking.amountMinorUnits, status: booking.refundStatus });
      }
    }
  }
  events.push({ kind: "summary", results, note: "This trip was already booked. Showing the saved result.", bookedMinorUnits, refundedMinorUnits });
  return events;
}

export async function POST(request: Request) {
  let input: z.infer<typeof captureRequestSchema>;
  try {
    input = captureRequestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid payment request." }, { status: 400 });
  }

  const { supabase, user } = await authedUser();

  let quote: PlanQuote | null;
  let bookings: BookingRecord[] = [];
  try {
    quote = await getQuoteByOrderId(input.orderId);
    if (quote?.status === "completed") bookings = await listBookings(quote.id);
  } catch (error) {
    console.error("quote lookup failed", error);
    return Response.json({ error: "Payment could not be confirmed." }, { status: 503 });
  }
  if (!quote || !canAccess(quote, user?.id)) {
    return Response.json({ error: "This payment was not found." }, { status: 404 });
  }

  if (quote.status === "completed") {
    const events = replayEvents(quote, bookings);
    return ndjsonResponse(
      new ReadableStream({
        start(controller) {
          for (const event of events) controller.enqueue(ndjsonLine(event));
          controller.close();
        },
      }),
    );
  }
  if (quote.status === "needs_attention") {
    return Response.json({ error: "This payment needs a manual check. Our team has been notified." }, { status: 409 });
  }
  // The conditional update is the lock: only one request moves ordered -> capturing.
  if (quote.status !== "ordered" || !(await transitionQuote(quote.id, "ordered", "capturing"))) {
    return Response.json({ error: "This payment is already being processed." }, { status: 409 });
  }

  const paid: PlanQuote = quote;
  const forceFailureOfferId = demoFailureOfferId(paid.offers, input.forceFailureOfferId);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // If the browser disconnects, keep going: the money has to reconcile
      // whether or not anyone is watching. Only the stream writes are skipped.
      let open = true;
      const emit = (event: CaptureStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(ndjsonLine(event));
        } catch {
          open = false;
        }
      };
      let captured = false;

      try {
        // The one and only moment the traveler's PayPal account is touched.
        const capture = await capturePlanOrder(input.orderId, { requestId: requestIds.capture(paid.id) });
        const amountMinorUnits = capture.purchaseUnits.reduce((sum, unit) => sum + unit.amountMinorUnits, 0);
        emit({ kind: "payment", status: capture.status, amountMinorUnits });

        if (capture.status !== "COMPLETED") {
          // Not approved yet, or the funding source was declined: nothing was
          // captured, so release the lock and let the traveller approve again.
          await setQuoteStatus(paid.id, "ordered");
          emit({
            kind: "error",
            message:
              capture.status === "INSTRUMENT_DECLINED"
                ? "PayPal declined that payment method. Approve again on PayPal with another one."
                : "Payment was not completed.",
          });
          return;
        }
        captured = true;

        if (user && input.destId && input.title) {
          // Best-effort receipt row — a failure here must never break booking.
          await supabase.from("orders").insert({
            user_id: user.id,
            label: input.orderId,
            paypal_order_id: input.orderId,
            title: input.title,
            dest_id: input.destId,
            total_minor_units: amountMinorUnits,
            items: paid.offers.length,
            status: "completed",
          }).then(({ error }) => {
            if (error) console.error("order receipt insert failed", error);
          });
        }

        // An Onboarded Supplier's offer was its own purchase unit, paid directly;
        // everything else summed into Tripweave's own bundle unit and still needs
        // a Supplier Booking. See GLOSSARY.md.
        const needsBooking = paid.offers.filter((offer) => !offer.supplierPayeeEmail);
        const alreadyPaidDirect = paid.offers.filter((offer) => offer.supplierPayeeEmail);

        const unitByReferenceId = new Map<string, PurchaseUnitCapture>(
          capture.purchaseUnits.map((unit) => [unit.referenceId, unit]),
        );
        const bundleUnit = unitByReferenceId.get(BUNDLE_REFERENCE_ID);
        const bundleCapturedAmount = bundleUnit?.amountMinorUnits ?? 0;

        // Reconcile per purchase unit against what PayPal actually captured.
        const needsBookingTotal = needsBooking.reduce((sum, offer) => sum + offer.costMinorUnits, 0);
        const directAmountMismatch = alreadyPaidDirect.some(
          (offer) => unitByReferenceId.get(offer.id)?.amountMinorUnits !== offer.costMinorUnits,
        );
        if (needsBookingTotal !== bundleCapturedAmount || directAmountMismatch) {
          await setQuoteStatus(paid.id, "needs_attention");
          emit({ kind: "error", message: "The paid amount does not match this itinerary." });
          return;
        }

        // An order can be COMPLETED while its capture is still PENDING (e.g.
        // PayPal risk review) or DECLINED. Tripweave only spends money it has
        // actually received, so it books nothing until the capture itself clears.
        const bundleCaptureStatus = bundleUnit?.captureStatus;
        if (needsBooking.length > 0 && bundleCaptureStatus && bundleCaptureStatus !== "COMPLETED") {
          await setQuoteStatus(paid.id, "needs_attention");
          emit({
            kind: "error",
            message:
              bundleCaptureStatus === "PENDING"
                ? "PayPal is still reviewing this payment. Booking starts once it clears."
                : "PayPal did not complete this payment, so nothing was booked.",
          });
          return;
        }

        await writeBookings(paid, [
          ...needsBooking.map((offer) => ({ offerId: offer.id, status: "pending" as const })),
          ...alreadyPaidDirect.map((offer) => {
            const unit = unitByReferenceId.get(offer.id);
            return {
              offerId: offer.id,
              status: "paid_direct" as const,
              captureId: unit?.captureId ?? null,
              captureStatus: unit?.captureStatus ?? capture.status,
            };
          }),
        ]);

        for (const offer of alreadyPaidDirect) {
          const unit = unitByReferenceId.get(offer.id);
          if (!unit) continue;
          emit({
            kind: "direct-payment",
            offerId: offer.id,
            status: unit.captureStatus ?? capture.status,
            reason: unit.captureStatusReason,
            amountMinorUnits: unit.amountMinorUnits,
          });
        }

        if (needsBooking.length === 0) {
          await setQuoteStatus(paid.id, "completed");
          emit({
            kind: "summary",
            results: [],
            note: "Every offer was paid directly to its own supplier. No simulated booking was needed.",
            bookedMinorUnits: 0,
            refundedMinorUnits: 0,
          });
          return;
        }

        if (!bundleUnit?.captureId) {
          throw new Error("Capture succeeded but returned no capture id to refund against.");
        }

        const lead = paid.travellers?.[0];
        const bookingSteps = runBookings(needsBooking, { keyPrefix: paid.id, forceFailureOfferId, ...(lead ? { leadTraveller: lead } : {}) });
        let step = await bookingSteps.next();
        while (!step.done) {
          emit(step.value);
          step = await bookingSteps.next();
        }
        const { results, note } = step.value;

        const { refunds, bookedMinorUnits, refundedMinorUnits } = reconcileBookings(
          needsBooking,
          results,
          bundleCapturedAmount,
        );

        await writeBookings(
          paid,
          results.map((result) =>
            result.status === "booked"
              ? { offerId: result.offerId, status: "booked" as const, bookingRef: result.bookingRef }
              : { offerId: result.offerId, status: "failed" as const, failureReason: result.reason },
          ),
        );

        for (const refund of refunds) {
          const result = await refundCapture(bundleUnit.captureId, refund.amountMinorUnits, {
            requestId: requestIds.refund(paid.id, refund.offerId),
          });
          await writeBookings(paid, [
            { offerId: refund.offerId, status: "failed", refundId: result.refundId, refundStatus: result.status },
          ]);
          emit({ kind: "refund", offerId: refund.offerId, amountMinorUnits: refund.amountMinorUnits, status: result.status });
        }

        await setQuoteStatus(paid.id, "completed");
        emit({ kind: "summary", results, note, bookedMinorUnits, refundedMinorUnits });
      } catch (error) {
        console.error("booking failed", error);
        // Before capture nothing moved, so the traveller may retry. After
        // capture the money is in, so a human has to reconcile it.
        await setQuoteStatus(paid.id, captured ? "needs_attention" : "ordered").catch((statusError) =>
          console.error("quote status update failed", statusError),
        );
        emit({ kind: "error", message: "Booking could not be completed." });
      } finally {
        if (open) controller.close();
      }
    },
    cancel() {
      // The browser went away; start() keeps running to completion.
    },
  });

  return ndjsonResponse(stream);
}
