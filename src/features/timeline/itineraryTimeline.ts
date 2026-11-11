import type { ItineraryPlanView, TravelOfferView } from "@/features/planner/travelOffer";
import type { RebookSuggestion } from "@/features/rebook/types";

// The trip page's timeline (Bryntum Scheduler) as plain data: one row per kind
// of booking, one bar per offer in the plan. Pure, so the checks the planner
// already made (schedule conflicts, the trip window) show on the bars exactly as
// the planner reported them; nothing here decides feasibility on its own.

export type TimelineKind = TravelOfferView["productKind"];

export type TimelineRow = { id: TimelineKind; name: string; iconCls: string };

export type TimelineFlag = "conflict" | "outside-window";

/**
 * What happened to a paid offer, as stored at capture (the bookings rows the
 * e-tickets read). Absent until the trip is paid.
 */
export type TimelineOutcome =
  | { state: "booked"; bookingRef: string | null }
  | { state: "paid-direct" }
  | { state: "refunded"; reason: string | null }
  | { state: "failed"; reason: string | null }
  | { state: "pending" }
  /** Not part of the paid trip: the rebooking agent proposes it for a refunded slot. */
  | { state: "suggested"; reason: string; forTitle: string };

/** The fields of a stored booking the timeline reads (TicketItem has them all). */
export type BookingOutcomeInput = {
  offerId: string;
  status: "booked" | "failed" | "paid_direct" | "pending";
  bookingRef: string | null;
  failureReason: string | null;
  refunded: boolean;
};

export function toOutcome(input: BookingOutcomeInput): TimelineOutcome {
  // A refund settles a failed booking; it wins over the status it came from.
  if (input.refunded) return { state: "refunded", reason: input.failureReason };
  if (input.status === "booked") return { state: "booked", bookingRef: input.bookingRef };
  if (input.status === "paid_direct") return { state: "paid-direct" };
  if (input.status === "failed") return { state: "failed", reason: input.failureReason };
  return { state: "pending" };
}

export type TimelineBar = {
  id: string;
  resourceId: TimelineKind;
  name: string;
  /** Wall-clock time where it happens (the offer's own offset), as a local Date for the grid. */
  startDate: Date;
  endDate: Date;
  costMinorUnits: number;
  supplier: string;
  synthetic: boolean;
  flags: TimelineFlag[];
  /** Plain-text names of the bars it clashes with, for the tooltip. */
  conflictsWith: string[];
  outcome?: TimelineOutcome;
};

export type TimelineModel = {
  rows: TimelineRow[];
  bars: TimelineBar[];
  /** The traveller's trip window, padded to whole days. */
  startDate: Date;
  endDate: Date;
  window: { startDate: Date; endDate: Date };
};

export const TIMELINE_ROWS: TimelineRow[] = [
  { id: "flight", name: "Flights", iconCls: "fa fa-plane" },
  { id: "hotel", name: "Stay", iconCls: "fa fa-bed" },
  { id: "activity", name: "Things to do", iconCls: "fa fa-compass" },
];

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/;

/**
 * The time on the clock where it happens: "2026-12-10T08:15:00+09:00" is 08:15
 * on Dec 10, wherever the viewer is. Same reading as the day-by-day list.
 */
export function wallClock(iso: string): Date {
  const m = WALL_CLOCK.exec(iso);
  if (!m) throw new Error(`Not an ISO date-time: ${iso}`);
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

/**
 * Start at the local start time and keep the real duration. A flight that lands
 * "earlier" than it left (crossing time zones westward) still gets its true length.
 */
function span(offer: Pick<TravelOfferView, "startsAt" | "endsAt">): { startDate: Date; endDate: Date } {
  const startDate = wallClock(offer.startsAt);
  const minutes = Math.max(30, Math.round((Date.parse(offer.endsAt) - Date.parse(offer.startsAt)) / 60_000));
  return { startDate, endDate: new Date(startDate.getTime() + minutes * 60_000) };
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function itineraryTimeline(
  plan: Pick<ItineraryPlanView, "offers" | "violations">,
  travelWindow: { startsAt: string; endsAt: string },
  bookings: readonly BookingOutcomeInput[] = [],
  suggestions: readonly RebookSuggestion[] = [],
): TimelineModel {
  const outcomes = new Map(bookings.map((b) => [b.offerId, toOutcome(b)]));
  const byId = new Map(plan.offers.map((o) => [o.id, o]));
  const flags = new Map<string, Set<TimelineFlag>>();
  const clashes = new Map<string, Set<string>>();
  const flag = (id: string, f: TimelineFlag) => {
    if (!byId.has(id)) return;
    (flags.get(id) ?? flags.set(id, new Set()).get(id)!).add(f);
  };
  for (const v of plan.violations) {
    if (v.kind === "outside-trip-window") flag(v.offerId, "outside-window");
    if (v.kind === "schedule-conflict") {
      flag(v.firstOfferId, "conflict");
      flag(v.secondOfferId, "conflict");
      const first = byId.get(v.firstOfferId);
      const second = byId.get(v.secondOfferId);
      if (first && second) {
        (clashes.get(first.id) ?? clashes.set(first.id, new Set()).get(first.id)!).add(second.title);
        (clashes.get(second.id) ?? clashes.set(second.id, new Set()).get(second.id)!).add(first.title);
      }
    }
  }

  const bars: TimelineBar[] = plan.offers
    .map((o) => ({
      id: o.id,
      resourceId: o.productKind,
      name: o.title,
      ...span(o),
      costMinorUnits: o.costMinorUnits,
      supplier: o.supplier,
      synthetic: o.synthetic,
      flags: [...(flags.get(o.id) ?? [])],
      conflictsWith: [...(clashes.get(o.id) ?? [])],
      ...(outcomes.has(o.id) ? { outcome: outcomes.get(o.id) } : {}),
    }))
    .concat(
      suggestions.map((s) => ({
        id: `suggested:${s.offer.id}`,
        resourceId: "activity" as const,
        name: s.offer.title,
        ...span(s.offer),
        costMinorUnits: s.offer.costMinorUnits,
        // Already a display label; platformInfo falls back to it for unknown suppliers.
        supplier: s.offer.platform,
        synthetic: s.offer.synthetic,
        flags: [],
        conflictsWith: [],
        outcome: { state: "suggested" as const, reason: s.reason, forTitle: s.forTitle },
      })),
    )
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const window = { startDate: wallClock(travelWindow.startsAt), endDate: wallClock(travelWindow.endsAt) };
  // Show the whole window, and any bar that spills past it, in whole days.
  const earliest = Math.min(window.startDate.getTime(), ...bars.map((b) => b.startDate.getTime()));
  const latest = Math.max(window.endDate.getTime(), ...bars.map((b) => b.endDate.getTime()));
  return {
    rows: TIMELINE_ROWS,
    bars,
    startDate: startOfDay(new Date(earliest)),
    endDate: addDays(startOfDay(new Date(latest - 1)), 1),
    window,
  };
}
