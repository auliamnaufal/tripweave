import { z } from "zod";
import type { ChatOpenAI } from "@langchain/openai";
import { createAgentModel, extractJson, lastMessageText } from "@/features/agent/agentRuntime";
import type { TravelOffer } from "@/features/planner/travelOffer";
import type { TripBrief } from "@/features/planner/tripBrief";
import { searchGear, type GearProduct } from "./channel3";

// The gear kit: a few things worth packing for *this* trip, with products
// from real retailers via Channel3. The model only names what to look for;
// the price cap comes from the plan's numbers and every product, price and
// link comes from Channel3. Nothing here is paid through the Trip Order.

export const MAX_GEAR_NEEDS = 4;
/** Below this much room under the budget there's no point suggesting gear. */
export const MIN_GEAR_ROOM_MINOR_UNITS = 2_000;

export const gearNeedSchema = z.object({
  item: z.string().trim().min(1).max(60),
  why: z.string().trim().min(1).max(140),
  query: z.string().trim().min(2).max(80),
});
export type GearNeed = z.infer<typeof gearNeedSchema>;
const gearNeedsSchema = z.object({ items: z.array(gearNeedSchema).min(1).max(8) });

/** Used when the model can't be reached: useful on almost any trip abroad. */
export const FALLBACK_NEEDS: GearNeed[] = [
  { item: "Universal travel adapter", why: "Keeps your phone charged wherever the sockets differ.", query: "universal travel adapter usb-c" },
  { item: "Packable daypack", why: "Folds into your bag, carries the day's water and layers.", query: "packable daypack" },
  { item: "Portable power bank", why: "Maps and boarding passes drain a phone fast.", query: "slim portable power bank 10000mah" },
];

export type GearRoom = {
  budgetMinorUnits: number;
  tripTotalMinorUnits: number;
  /** What's left under the hard budget after the Trip Order. */
  leftoverMinorUnits: number;
  /** How many of each item the cap allows for: one per traveller. */
  travelers: number;
  /** Each item is searched at or under this, so one of each per traveller still fits. */
  perItemCapMinorUnits: number;
};

/** Pure: how much each gear item may cost so the trip plus one of each, per traveller, stays under budget. */
export function gearRoom(budgetMinorUnits: number, tripTotalMinorUnits: number, needs: number, travelers = 1): GearRoom {
  const leftover = Math.max(0, budgetMinorUnits - tripTotalMinorUnits);
  const people = Math.max(1, travelers);
  return {
    budgetMinorUnits,
    tripTotalMinorUnits,
    leftoverMinorUnits: leftover,
    travelers: people,
    perItemCapMinorUnits: needs > 0 ? Math.floor(leftover / (needs * people)) : 0,
  };
}

const monthName = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

export function gearPrompt(brief: TripBrief, offers: readonly TravelOffer[]): string {
  const route = brief.stops?.length ? brief.stops.map((stop) => `${stop.city} (${stop.nights} nights)`).join(", then ") : brief.destination.city;
  const activities = offers.filter((offer) => offer.productKind === "activity").map((offer) => offer.title);
  const wishes = (brief.dayPlans ?? []).map((plan) => `day ${plan.day}: ${plan.wish}`);
  return [
    `You suggest what a traveller should buy before a trip, and return ONLY a JSON object, no prose.`,
    `Trip: ${route}, ${brief.destination.country}, in ${monthName(brief.travelWindow.startsAt)}, ${brief.travelers} traveller(s), flying from ${brief.origin.city}.`,
    activities.length ? `Booked activities: ${activities.join("; ")}.` : "No activities booked.",
    wishes.length ? `They asked for: ${wishes.join("; ")}.` : "",
    brief.preferences.length ? `Preferences: ${brief.preferences.join(", ")}.` : "",
    `Pick at most ${MAX_GEAR_NEEDS} items that fit the season, the climate there and the activities: physical products a normal online store sells.`,
    "No luggage sets, no medicine, no tickets, passes, SIM or eSIM plans, insurance or services. Nothing the hotel or tour provides.",
    '"query" is a short shopping search (3-6 words, no brand, no price). "why" is one short sentence tied to this trip.',
    'Shape: {"items":[{"item":"Packable rain jacket","why":"Tokyo in June is the rainy season.","query":"packable waterproof rain jacket"}]}',
  ]
    .filter(Boolean)
    .join("\n");
}

/** Asks the model what to pack; falls back to a generic kit if it fails. */
export async function gearNeeds(brief: TripBrief, offers: readonly TravelOffer[], deps: { llm?: ChatOpenAI } = {}): Promise<GearNeed[]> {
  try {
    const llm = deps.llm ?? createAgentModel();
    const reply = await llm.invoke([
      { role: "system", content: gearPrompt(brief, offers) },
      { role: "user", content: "What should I pack for this trip?" },
    ]);
    const { items } = gearNeedsSchema.parse(extractJson(lastMessageText([reply])));
    const unique = items.filter((need, i) => items.findIndex((other) => other.query.toLowerCase() === need.query.toLowerCase()) === i);
    return unique.slice(0, MAX_GEAR_NEEDS);
  } catch (error) {
    console.error("gear needs fell back to the generic kit", error);
    return FALLBACK_NEEDS;
  }
}

export type GearKit = {
  room: GearRoom;
  items: { need: GearNeed; products: GearProduct[] }[];
};

/**
 * Builds the kit for a priced plan: needs from the model, cap from the
 * numbers, products from Channel3 (one search per need, in parallel). A need
 * whose search fails or finds nothing in budget comes back with no products.
 */
export async function buildGearKit(
  input: { brief: TripBrief; offers: readonly TravelOffer[]; tripTotalMinorUnits: number },
  deps: { needs?: (brief: TripBrief, offers: readonly TravelOffer[]) => Promise<GearNeed[]>; search?: typeof searchGear } = {},
): Promise<GearKit> {
  const budget = input.brief.hardBudget.amountMinorUnits;
  if (budget - input.tripTotalMinorUnits < MIN_GEAR_ROOM_MINOR_UNITS) {
    return { room: gearRoom(budget, input.tripTotalMinorUnits, 0, input.brief.travelers), items: [] };
  }
  const needs = await (deps.needs ?? gearNeeds)(input.brief, input.offers);
  const room = gearRoom(budget, input.tripTotalMinorUnits, needs.length, input.brief.travelers);
  const search = deps.search ?? searchGear;
  const results = await Promise.allSettled(needs.map((need) => search(need.query, room.perItemCapMinorUnits)));
  const rejected = results.filter((result) => result.status === "rejected");
  // Every search failing means Channel3 itself is down or refusing the key:
  // say so instead of showing a kit of empty items.
  if (needs.length > 0 && rejected.length === needs.length) throw (rejected[0] as PromiseRejectedResult).reason;
  return {
    room,
    items: needs.map((need, i) => {
      const result = results[i];
      return { need, products: result.status === "fulfilled" ? result.value : [] };
    }),
  };
}
