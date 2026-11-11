import type { TripBrief } from "@/features/planner/tripBrief";
import { parseTripBrief } from "@/features/planner/tripBrief";
import type { BookingRecord, PlanQuote } from "@/features/quotes/quote";
import { platformInfo } from "@/features/suppliers/platforms";

// The rows behind the Trip spend dashboard (AG Studio): one row per paid Trip
// Order and one per offer in it, built only from what the server stored at
// capture (plan_quotes + bookings). Amounts stay in minor units here; the
// dashboard shows dollars, so the USD columns are the one place they're divided.

export type PaidQuote = Pick<PlanQuote, "id" | "offers" | "totalMinorUnits" | "status" | "paypalOrderId" | "brief" | "travellers"> & {
  createdAt: string;
};

export type BookingOutcome = "Booked" | "Paid direct" | "Refunded" | "Failed" | "Pending";

export type InsightsTripRow = {
  tripId: string;
  paypalOrderId: string;
  trip: string;
  destination: string;
  paidOn: string;
  status: "Completed" | "Capturing" | "Needs attention";
  travellers: number;
  items: number;
  paidUsd: number;
  bookedUsd: number;
  refundedUsd: number;
  pendingUsd: number;
  /** paid = booked + refunded + pending, to the cent: the invariant capture enforces. */
  reconciles: "Yes" | "No";
};

export type InsightsBookingRow = {
  bookingId: string;
  tripId: string;
  trip: string;
  kind: "Flight" | "Stay" | "Activity";
  item: string;
  platform: string;
  data: "Live" | "Simulated";
  startsOn: string;
  amountUsd: number;
  outcome: BookingOutcome;
  bookingRef: string;
};

export type InsightsData = { trips: InsightsTripRow[]; bookings: InsightsBookingRow[] };

const KIND: Record<string, InsightsBookingRow["kind"]> = { flight: "Flight", hotel: "Stay", activity: "Activity" };
const STATUS: Record<string, InsightsTripRow["status"]> = { completed: "Completed", capturing: "Capturing", needs_attention: "Needs attention" };

const usd = (minor: number) => Math.round(minor) / 100;

export function bookingOutcome(booking: Pick<BookingRecord, "status" | "refundStatus"> | undefined): BookingOutcome {
  if (!booking) return "Pending";
  // A refund settles a failed booking, so it wins over the status it came from.
  if (booking.refundStatus) return "Refunded";
  if (booking.status === "booked") return "Booked";
  if (booking.status === "paid_direct") return "Paid direct";
  if (booking.status === "failed") return "Failed";
  return "Pending";
}

function briefOf(quote: PaidQuote): TripBrief | null {
  try {
    return parseTripBrief(quote.brief);
  } catch {
    return null;
  }
}

function tripLabel(quote: PaidQuote, brief: TripBrief | null): string {
  const place = brief ? (brief.stops?.length ? brief.stops.map((s) => s.city).join(" → ") : brief.destination.city) : "Trip";
  const day = new Date(brief?.travelWindow.startsAt ?? quote.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${place} · ${day}`;
}

export function buildInsights(paid: readonly { quote: PaidQuote; bookings: readonly BookingRecord[] }[]): InsightsData {
  const trips: InsightsTripRow[] = [];
  const bookings: InsightsBookingRow[] = [];

  for (const { quote, bookings: stored } of paid) {
    const brief = briefOf(quote);
    const trip = tripLabel(quote, brief);
    const byOffer = new Map(stored.map((b) => [b.offerId, b]));
    let booked = 0;
    let refunded = 0;
    let pending = 0;

    for (const offer of quote.offers) {
      const record = byOffer.get(offer.id);
      const outcome = bookingOutcome(record);
      // What the traveller paid for this line is the stored booking amount; the
      // offer's own cost stands in only before a booking row exists.
      const amount = record?.amountMinorUnits ?? offer.costMinorUnits;
      if (outcome === "Booked" || outcome === "Paid direct") booked += amount;
      else if (outcome === "Refunded") refunded += amount;
      else pending += amount;

      const info = platformInfo(offer.supplier);
      bookings.push({
        bookingId: `${quote.id}:${offer.id}`,
        tripId: quote.id,
        trip,
        kind: KIND[offer.productKind] ?? "Activity",
        item: offer.title,
        platform: info.label,
        data: info.data === "live" && !offer.synthetic ? "Live" : "Simulated",
        startsOn: offer.startsAt.slice(0, 10),
        amountUsd: usd(amount),
        outcome,
        bookingRef: record?.bookingRef ?? "",
      });
    }

    trips.push({
      tripId: quote.id,
      paypalOrderId: quote.paypalOrderId ?? "",
      trip,
      destination: brief?.destination.city ?? "Unknown",
      paidOn: quote.createdAt.slice(0, 10),
      status: STATUS[quote.status] ?? "Needs attention",
      travellers: quote.travellers?.length || brief?.travelers || 1,
      items: quote.offers.length,
      paidUsd: usd(quote.totalMinorUnits),
      bookedUsd: usd(booked),
      refundedUsd: usd(refunded),
      pendingUsd: usd(pending),
      reconciles: booked + refunded + pending === quote.totalMinorUnits ? "Yes" : "No",
    });
  }

  return { trips, bookings };
}

export type TripOrderAudit = {
  trip: string;
  paypalOrderId: string;
  paidUsd: number;
  bookedUsd: number;
  refundedUsd: number;
  pendingUsd: number;
  reconciles: boolean;
  /** Lines that didn't end up booked, with what happened to the money. */
  exceptions: { item: string; platform: string; amountUsd: number; outcome: BookingOutcome }[];
};

/**
 * For the dashboard's auditor agent: per Trip Order, what PayPal captured and
 * where each dollar went. Computed here, never by the model, so the agent can
 * only explain numbers, not invent them.
 */
export function auditTripOrders(data: InsightsData, tripId?: string): TripOrderAudit[] {
  return data.trips
    .filter((t) => !tripId || t.tripId === tripId || t.paypalOrderId === tripId)
    .map((t) => ({
      trip: t.trip,
      paypalOrderId: t.paypalOrderId,
      paidUsd: t.paidUsd,
      bookedUsd: t.bookedUsd,
      refundedUsd: t.refundedUsd,
      pendingUsd: t.pendingUsd,
      reconciles: t.reconciles === "Yes",
      exceptions: data.bookings
        .filter((b) => b.tripId === t.tripId && b.outcome !== "Booked" && b.outcome !== "Paid direct")
        .map((b) => ({ item: b.item, platform: b.platform, amountUsd: b.amountUsd, outcome: b.outcome })),
    }));
}
