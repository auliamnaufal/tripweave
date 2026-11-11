import type { TravelOffer } from "@/features/planner/travelOffer";
import { platformInfo } from "./platforms";

// The "pick another option" choices for a plan, taken from the catalog it was
// planned from. A slot is what an option can replace: the same flight leg, or
// the same stay (same dates). Swapping within a slot can't break the trip's shape.

export type AlternativeOption = {
  offerId: string;
  title: string;
  summary: string;
  platform: { supplier: string; label: string; data: "live" | "simulated" };
  costMinorUnits: number;
  cancellationTerms: string | null;
  startsAt: string;
  endsAt: string;
};

export type AlternativeSlot = {
  slot: string;
  kind: "flight" | "hotel";
  label: string;
  currentOfferId: string;
  options: AlternativeOption[];
};

const LEG = /-(outbound|return|leg\d+)-\d+$/;

export function slotOf(offer: TravelOffer): string | null {
  if (offer.productKind === "flight") {
    const leg = LEG.exec(offer.id)?.[1];
    return leg ? `flight:${leg}` : null;
  }
  if (offer.productKind === "hotel") return `hotel:${offer.startsAt}_${offer.endsAt}`;
  return null;
}

function option(offer: TravelOffer): AlternativeOption {
  const info = platformInfo(offer.supplier);
  return {
    offerId: offer.id,
    title: offer.title,
    summary: offer.summary,
    platform: { supplier: offer.supplier, label: info.label, data: info.data },
    costMinorUnits: offer.costMinorUnits,
    cancellationTerms: offer.cancellationTerms,
    startsAt: offer.startsAt,
    endsAt: offer.endsAt,
  };
}

function legLabel(slot: string, offer: TravelOffer): string {
  const leg = slot.split(":")[1];
  const route = /^([A-Z]{3}) to ([A-Z]{3})/.exec(offer.title);
  const path = route ? `${route[1]} → ${route[2]}` : offer.title;
  return leg === "outbound" ? `Outbound · ${path}` : leg === "return" ? `Return · ${path}` : `Flight · ${path}`;
}

/** Up to `limit` options per slot the plan uses, cheapest first, always including the current pick. */
export function alternativesFor(planOffers: readonly TravelOffer[], catalog: readonly TravelOffer[], limit = 6): AlternativeSlot[] {
  const bySlot = new Map<string, TravelOffer[]>();
  for (const offer of catalog) {
    const slot = slotOf(offer);
    if (!slot) continue;
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), offer]);
  }
  const slots: AlternativeSlot[] = [];
  for (const current of planOffers) {
    const slot = slotOf(current);
    if (!slot) continue;
    const pool = (bySlot.get(slot) ?? []).sort((a, b) => a.costMinorUnits - b.costMinorUnits);
    const chosen = pool.slice(0, limit);
    if (!chosen.some((offer) => offer.id === current.id)) chosen.splice(limit - 1, 1, current);
    slots.push({
      slot,
      kind: current.productKind as "flight" | "hotel",
      label: current.productKind === "flight" ? legLabel(slot, current) : `Stay · ${current.title.split(" - ")[0]}`,
      currentOfferId: current.id,
      options: chosen.sort((a, b) => a.costMinorUnits - b.costMinorUnits).map(option),
    });
  }
  return slots.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "flight" ? -1 : 1));
}

/**
 * Activities the traveller can add or remove, from the same search: every
 * activity already in the plan plus the catalog's others inside the trip
 * window, in time order, up to `limit` in total.
 */
export function activityOptionsFor(
  planOffers: readonly TravelOffer[],
  catalog: readonly TravelOffer[],
  window: { startsAt: string; endsAt: string },
  limit = 12,
): AlternativeOption[] {
  const first = window.startsAt.slice(0, 10);
  const last = window.endsAt.slice(0, 10);
  const inPlan = planOffers.filter((offer) => offer.productKind === "activity");
  const others = catalog
    .filter((offer) => offer.productKind === "activity" && !inPlan.some((own) => own.id === offer.id))
    .filter((offer) => offer.startsAt.slice(0, 10) >= first && offer.endsAt.slice(0, 10) <= last)
    .sort((a, b) => a.costMinorUnits - b.costMinorUnits)
    .slice(0, Math.max(0, limit - inPlan.length));
  return [...inPlan, ...others].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).map(option);
}

/**
 * Full offers for every choice the plan screen offers (swap options and
 * activities), so the browser can rebuild the itinerary instantly with the
 * same deterministic `buildItinerary` the server uses. The server still
 * re-checks and prices every edit before it becomes a payable quote.
 */
export function choicesFor(slots: readonly AlternativeSlot[], activities: readonly AlternativeOption[], catalog: readonly TravelOffer[]): TravelOffer[] {
  const ids = new Set([...slots.flatMap((slot) => slot.options.map((o) => o.offerId)), ...activities.map((a) => a.offerId)]);
  return catalog.filter((offer) => ids.has(offer.id));
}

/**
 * Whether `next` is a legal edit of `current`: the same flight legs and stays
 * (one option each, swapped only within its own slot), and any set of
 * distinct activities. Prices and feasibility are checked separately.
 */
export function checkEdit(current: readonly TravelOffer[], next: readonly TravelOffer[]): string | null {
  if (new Set(next.map((offer) => offer.id)).size !== next.length) return "An item appears twice in this plan.";
  const slots = (offers: readonly TravelOffer[]) =>
    offers
      .filter((offer) => offer.productKind !== "activity")
      .map((offer) => slotOf(offer) ?? `fixed:${offer.id}`)
      .sort()
      .join("|");
  if (slots(current) !== slots(next)) return "Flights and stays can only be swapped for another option on the same leg or dates.";
  return null;
}

/** The plan's offers with one swapped for another option in the same slot, or an error saying why not. */
export function swapOffer(
  planOffers: readonly TravelOffer[],
  catalog: readonly TravelOffer[],
  fromOfferId: string,
  toOfferId: string,
): { offers: TravelOffer[] } | { error: string } {
  const from = planOffers.find((offer) => offer.id === fromOfferId);
  const to = catalog.find((offer) => offer.id === toOfferId);
  if (!from) return { error: "That item isn't in this plan." };
  if (!to) return { error: "That option is no longer in this search." };
  const slot = slotOf(from);
  if (!slot || slot !== slotOf(to)) return { error: "That option can't replace this item." };
  return { offers: planOffers.map((offer) => (offer.id === fromOfferId ? to : offer)) };
}
