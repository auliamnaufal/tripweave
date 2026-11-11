"use client";

import type { RebookResponse } from "@/features/rebook/types";
import type { PlanStreamEvent } from "@/app/api/plan/route";
import type { CaptureStreamEvent } from "@/app/api/payments/capture/route";
import type { GearKit } from "@/features/gear/gearKit";
import type { ItineraryPlanView } from "@/features/planner/travelOffer";
import type { PlanResult } from "@/features/quotes/planResult";
import { getDestination, origins, type TripPrefs } from "@/features/ui-mock/destinations";

/** The wire shape `/api/plan` accepts (see `tripBriefSchema`). */
export type TripBriefWire = {
  origin: { city: string; country: string };
  destination: { city: string; country: string };
  timeZone: string;
  travelers: number;
  travelWindow: { startsAt: string; endsAt: string };
  hardBudget: { currency: "USD"; amountMinorUnits: number };
  preferences: string[];
  constraints: string[];
  stops?: { city: string; country: string; nights: number }[];
  dayPlans?: { day: number; wish: string }[];
};

const originCountry: Record<string, string> = {
  "San Francisco": "United States",
  "New York": "United States",
  London: "United Kingdom",
  Singapore: "Singapore",
  Jakarta: "Indonesia",
};

/**
 * The traveller's home airport ("San Francisco (SFO)", or any "City, Country")
 * as the place flights start from. Falls back to San Francisco.
 */
export function homeOrigin(label?: string | null): { city: string; country: string } {
  const raw = (label ?? "").replace(/\s*\([A-Z]{3}\)\s*$/, "").trim();
  const [city, country] = raw.split(/\s*,\s*/);
  if (city && country) return { city, country };
  if (city && originCountry[city]) return { city, country: originCountry[city] };
  // A bare city name: the airport search resolves it; the country only has to be non-empty.
  if (city) return { city, country: city };
  return { city: "San Francisco", country: "United States" };
}

// The airport city Duffel should search for each catalog destination.
const flightCity: Record<string, { city: string; country: string }> = {
  oahu: { city: "Honolulu", country: "United States" },
  kyoto: { city: "Osaka", country: "Japan" },
  lisbon: { city: "Lisbon", country: "Portugal" },
  patagonia: { city: "El Calafate", country: "Argentina" },
  bali: { city: "Denpasar", country: "Indonesia" },
  amalfi: { city: "Naples", country: "Italy" },
  iceland: { city: "Reykjavik", country: "Iceland" },
};

function startOffsetDays(when: string): number {
  const w = when.toLowerCase();
  if (w.includes("weekend")) return 21;
  if (w.includes("spring")) return 45;
  return 30;
}

function dayIso(date: Date, endOfDay = false): string {
  const d = date.toISOString().slice(0, 10);
  return endOfDay ? `${d}T23:59:59Z` : `${d}T00:00:00Z`;
}

/** Turns the planner's answers into the trip brief the real agent expects. */
export function briefFromPrefs(prefs: TripPrefs, extraConstraints: string[] = [], today = new Date()): TripBriefWire {
  const start = new Date(today.getTime() + startOffsetDays(prefs.when) * 86_400_000);
  const end = new Date(start.getTime() + prefs.nights * 86_400_000);
  // A listed city, or any "City, Country (IATA)" picked from the airport search.
  const listed = origins.find((o) => o.city === prefs.origin);
  const typed = homeOrigin(prefs.origin);
  const origin = listed ?? (prefs.origin && typed.city !== "San Francisco" ? { city: typed.city } : origins[0]);
  const originPlace = listed ? { city: listed.city, country: originCountry[listed.city] ?? "United States" } : prefs.origin && typed.city !== "San Francisco" ? typed : { city: origin.city, country: originCountry[origin.city] ?? "United States" };
  const dest = flightCity[prefs.destId] ?? { city: getDestination(prefs.destId).name, country: getDestination(prefs.destId).country };
  return {
    origin: originPlace,
    destination: dest,
    timeZone: "UTC",
    travelers: prefs.travelers,
    travelWindow: { startsAt: dayIso(start), endsAt: dayIso(end, true) },
    hardBudget: { currency: "USD", amountMinorUnits: Math.round(Math.min(prefs.budget, 50_000) * 100) },
    preferences: prefs.vibes.length ? prefs.vibes.map((v) => v.toLowerCase()) : ["relaxed pace"],
    constraints: extraConstraints.slice(0, 20),
  };
}

async function* readNdjson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i = buffer.indexOf("\n");
    while (i !== -1) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      if (line.trim()) yield JSON.parse(line) as T;
      i = buffer.indexOf("\n");
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer) as T;
}

async function errorText(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string; reason?: string | null } | null;
  // A specific reason ("At most 9 travellers per trip.") beats the generic error.
  return body?.reason ?? body?.error ?? fallback;
}

export type IntakeResult =
  | { kind: "brief"; brief: TripBriefWire; summary: string; stops: { city: string; country: string; nights: number }[]; dayPlans: { day: number; wish: string }[] }
  | { kind: "clarify"; question: string };

/**
 * Saves an edited selection (swapped flights/stays, added or removed
 * activities) as a new payable quote. No new search: the server rebuilds the
 * plan from the quote's own search snapshot.
 */
export async function editPlan(quoteId: string, offerIds: string[], signal?: AbortSignal): Promise<PlanResult> {
  const response = await fetch("/api/plan/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quoteId, offerIds }),
    signal,
  });
  if (!response.ok) throw new Error(await errorText(response, "I couldn’t change that."));
  return (await response.json()) as PlanResult;
}

export type GearKitResult = GearKit & { disclosure: string };

/** Gear worth packing for a priced plan (Channel3 link-outs; never part of the PayPal order). */
export async function fetchGearKit(quoteId: string): Promise<GearKitResult> {
  const response = await fetch("/api/gear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quoteId }),
  });
  if (!response.ok) throw new Error(await errorText(response, "I couldn’t put a gear list together."));
  return (await response.json()) as GearKitResult;
}

export type SimilarGearResult = { products: GearKit["items"][number]["products"]; capMinorUnits: number; disclosure: string };

/** Channel3 products like one gear pick, at or under the same per-item cap (set by the server). */
export async function fetchSimilarGear(quoteId: string, productId: string): Promise<SimilarGearResult> {
  const response = await fetch("/api/gear/similar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quoteId, productId }),
  });
  if (!response.ok) throw new Error(await errorText(response, "I couldn’t find anything similar."));
  return (await response.json()) as SimilarGearResult;
}

/** The intake agent: free text in, a validated brief (or one clarifying question) out. */
export async function readTrip(
  text: string,
  defaults: { origin: { city: string; country: string }; travelers: number; budgetUsd: number },
): Promise<IntakeResult> {
  const response = await fetch("/api/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, defaults }),
  });
  const body = (await response.json().catch(() => null)) as
    | { brief?: TripBriefWire; summary?: string; stops?: { city: string; country: string; nights: number }[]; dayPlans?: { day: number; wish: string }[]; clarification?: string; error?: string }
    | null;
  if (!response.ok) throw new Error(body?.error ?? "I couldn’t read that request.");
  if (body?.clarification || !body?.brief) return { kind: "clarify", question: body?.clarification ?? "Where would you like to go?" };
  return { kind: "brief", brief: body.brief, summary: body.summary ?? "", stops: body.stops ?? [], dayPlans: body.dayPlans ?? [] };
}

/** Streams `/api/plan`. Each event is handed to `onEvent` as it arrives. */
export async function streamPlan(brief: TripBriefWire, onEvent: (event: PlanStreamEvent) => void): Promise<void> {
  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(brief),
  });
  if (!response.ok || !response.body) throw new Error(await errorText(response, "The planner is unavailable."));
  for await (const event of readNdjson<PlanStreamEvent>(response.body)) onEvent(event);
}

export type OrderResult = { orderId: string; approveUrl: string; amountMinorUnits: number };

/**
 * A refused order. `code: "quote-repriced"` carries the re-priced plan and its
 * new quote id: show the new total, and the traveller pays that quote instead.
 */
export class OrderError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly repriced?: { quoteId: string; plan: ItineraryPlanView; previousTotalMinorUnits: number },
  ) {
    super(message);
  }
}

/** Pays the server-held quote. The browser never sends prices or offers. */
export type TravellerName = { firstName: string; lastName: string; email?: string };

export async function createOrder(quoteId: string | undefined, travellers?: TravellerName[]): Promise<OrderResult> {
  if (!quoteId) throw new OrderError("This plan needs a refresh before it can be paid. Ask the planner to plan it again.");
  const response = await fetch("/api/payments/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quoteId, ...(travellers?.length ? { travellers } : {}) }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string; code?: string; quoteId?: string; plan?: ItineraryPlanView; previousTotalMinorUnits?: number }
      | null;
    const repriced =
      body?.code === "quote-repriced" && body.quoteId && body.plan
        ? { quoteId: body.quoteId, plan: body.plan, previousTotalMinorUnits: body.previousTotalMinorUnits ?? 0 }
        : undefined;
    throw new OrderError(body?.error ?? "PayPal is unavailable right now.", body?.code, repriced);
  }
  return (await response.json()) as OrderResult;
}

export async function streamCapture(
  input: { orderId: string; forceFailureOfferId?: string; destId?: string; title?: string },
  onEvent: (event: CaptureStreamEvent) => void,
): Promise<void> {
  const response = await fetch("/api/payments/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok || !response.body) throw new Error(await errorText(response, "Payment could not be confirmed."));
  for await (const event of readNdjson<CaptureStreamEvent>(response.body)) onEvent(event);
}

/** The rebooking agent's replacement suggestions for a paid order's refunded activities. Never books or charges. */
export async function fetchRebookSuggestions(orderId: string): Promise<RebookResponse> {
  const response = await fetch("/api/rebook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId }),
  });
  if (!response.ok) throw new Error(await errorText(response, "The rebooking agent couldn’t answer right now."));
  return (await response.json()) as RebookResponse;
}
