"use client";

import type { PlanStreamEvent } from "@/app/api/plan/route";
import type { CaptureStreamEvent } from "@/app/api/payments/capture/route";
import type { TravelOfferView } from "@/features/planner/travelOffer";
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
};

const originCountry: Record<string, string> = {
  "San Francisco": "United States",
  "New York": "United States",
  London: "United Kingdom",
  Singapore: "Singapore",
  Jakarta: "Indonesia",
};

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
  const origin = origins.find((o) => o.city === prefs.origin) ?? origins[0];
  const dest = flightCity[prefs.destId] ?? { city: getDestination(prefs.destId).name, country: getDestination(prefs.destId).country };
  return {
    origin: { city: origin.city, country: originCountry[origin.city] ?? "United States" },
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
  const body: unknown = await response.json().catch(() => null);
  return (body as { error?: string } | null)?.error ?? fallback;
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

export async function createOrder(offers: TravelOfferView[]): Promise<OrderResult> {
  const response = await fetch("/api/payments/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offers }),
  });
  if (!response.ok) throw new Error(await errorText(response, "PayPal is unavailable right now."));
  return (await response.json()) as OrderResult;
}

export async function streamCapture(
  input: { orderId: string; offers: TravelOfferView[]; forceFailureOfferId?: string },
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
