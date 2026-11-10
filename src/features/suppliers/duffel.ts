import type { TripBrief } from "@/features/planner/tripBrief";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";
import type { RepriceResult, SupplierAdapter } from "./adapter";
import { simulateBooking } from "./booking";

function apiKey(): string {
  const key = process.env.DUFFEL_API_KEY;
  if (!key) throw new Error("Duffel is not configured.");
  return key;
}

class DuffelHttpError extends Error {
  constructor(
    readonly path: string,
    readonly status: number | undefined,
  ) {
    super(`Duffel request to ${path} failed${status ? ` (${status})` : ""}.`);
  }
}

async function duffelFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`https://api.duffel.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Duffel-Version": "v2",
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!response.ok) throw new DuffelHttpError(path, response.status);
  return response.json();
}

type Place = { iata_code?: string; time_zone?: string; iata_country_code?: string };

export type ResolvedPlace = { iata_code: string; time_zone: string; country_code?: string };

async function resolvePlace(query: string): Promise<ResolvedPlace> {
  const qs = new URLSearchParams({ query }).toString();
  const body = (await duffelFetch(`/places/suggestions?${qs}`)) as { data?: Place[] };
  // Duffel's suggestions mix city and airport entries; only some carry
  // time_zone, so the top match isn't always usable. Take the first one
  // that actually has both fields instead of assuming index 0 does.
  const place = (body.data ?? []).find((item) => item.iata_code && item.time_zone);
  if (!place?.iata_code || !place.time_zone) {
    throw new Error(`No place match with a known timezone for "${query}".`);
  }
  return {
    iata_code: place.iata_code,
    time_zone: place.time_zone,
    ...(place.iata_country_code ? { country_code: place.iata_country_code } : {}),
  };
}

const placeCache = new Map<string, Promise<ResolvedPlace>>();

/** Airport code, time zone and country for a city, shared by every supplier that needs them. */
export function resolveAirport(city: string): Promise<ResolvedPlace> {
  const key = city.trim().toLowerCase();
  const hit = placeCache.get(key);
  if (hit) return hit;
  const promise = resolvePlace(city);
  promise.catch(() => placeCache.delete(key));
  placeCache.set(key, promise);
  return promise;
}

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function stamp(): { retrievedAt: string; expiresAt: string } {
  const retrievedAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(retrievedAt) + 15 * 60_000).toISOString();
  return { retrievedAt, expiresAt };
}

// Duffel returns each segment's time as local-to-that-airport with no offset.
// We resolve the real IANA zone for the leg's own origin/destination airport
// and compute its offset for that date, instead of guessing one flat offset.
// ponytail: a multi-stop itinerary's intermediate layover times still use the
// final destination's zone, not the layover airport's own. Upgrade by
// resolving each segment's own airport zone if layover timing ever matters.
function offsetForZone(timeZone: string, atMs: number): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(
    new Date(atMs),
  );
  const match = /GMT([+-]\d{2}:\d{2})?/.exec(parts.find((part) => part.type === "timeZoneName")?.value ?? "");
  return match?.[1] ?? "+00:00";
}

function withRealOffset(naiveLocalIso: string, timeZone: string): string {
  const approxInstant = Date.parse(`${naiveLocalIso}Z`);
  return `${naiveLocalIso}${offsetForZone(timeZone, approxInstant)}`;
}

type RateCache = { rate: number; fetchedAt: number };
const rateCache = new Map<string, RateCache>();
const RATE_TTL_MS = 60 * 60_000;

// ponytail: Duffel prices every offer in the account's own billing currency,
// which isn't overridable per-request (confirmed against their docs). We
// convert to USD at this boundary with a live ECB rate so the rest of the
// app (hardBudget, planner totals, the UI, PayPal's $5 charge) can keep
// assuming USD everywhere. Upgrade if Duffel ever adds a per-request
// currency, or if staleness within the hour-long cache matters.
async function usdRate(currency: string): Promise<number> {
  if (currency === "USD") return 1;
  const cached = rateCache.get(currency);
  if (cached && Date.now() - cached.fetchedAt < RATE_TTL_MS) return cached.rate;
  const response = await fetch(`https://api.frankfurter.dev/v1/latest?from=${currency}&to=USD`);
  if (!response.ok) throw new Error(`Could not fetch a ${currency}-to-USD exchange rate.`);
  const body = (await response.json()) as { rates?: Record<string, number> };
  const rate = body.rates?.USD;
  if (!rate) throw new Error(`No USD rate returned for ${currency}.`);
  rateCache.set(currency, { rate, fetchedAt: Date.now() });
  return rate;
}

type DuffelOffer = {
  id: string;
  total_amount: string;
  total_currency: string;
  /** Duffel's own deadline for this price. Usually 15–30 minutes out. */
  expires_at?: string;
  owner?: { name?: string };
  slices: {
    segments: DuffelSegment[];
  }[];
};

type DuffelSegment = {
  departing_at: string;
  arriving_at: string;
  marketing_carrier?: { iata_code?: string };
  marketing_carrier_flight_number?: string;
};

/** The route and travel day, for comparing different flights in the same market. */
export function flightMarketKey(from: string, to: string, localDeparture: string): string {
  return `flight-market:${from}-${to}@${localDeparture.slice(0, 10)}`;
}

/**
 * The same flights on any platform: every segment's marketing carrier and
 * flight number, plus the first departure in local time. Any source that
 * reports those fields produces the same key, so their prices can be compared.
 */
export function flightProductKey(segments: readonly DuffelSegment[]): string | undefined {
  if (segments.length === 0) return undefined;
  const parts: string[] = [];
  for (const segment of segments) {
    const carrier = segment.marketing_carrier?.iata_code;
    const number = segment.marketing_carrier_flight_number;
    if (!carrier || !number) return undefined;
    parts.push(`${carrier}${number}`);
  }
  return `flight:${parts.join("+")}@${segments[0].departing_at.slice(0, 16)}`;
}

async function searchFlightLeg(
  from: string,
  to: string,
  departureDate: string,
  adults: number,
  legLabel: "outbound" | "return",
  departureZone: string,
  arrivalZone: string,
  stamped: { retrievedAt: string; expiresAt: string },
): Promise<TravelOffer[]> {
  const body = (await duffelFetch("/air/offer_requests?return_offers=true", {
    method: "POST",
    body: JSON.stringify({
      data: {
        slices: [{ origin: from, destination: to, departure_date: departureDate }],
        passengers: Array.from({ length: adults }, () => ({ type: "adult" })),
      },
    }),
  })) as { data?: { offers?: DuffelOffer[] } };

  const offers = body.data?.offers ?? [];
  if (offers.length === 0) return [];
  const rate = await usdRate(offers[0].total_currency);

  return offers.slice(0, 3).flatMap((offer, index) => {
    const segments = offer.slices[0]?.segments ?? [];
    if (segments.length === 0) return [];
    const first = segments[0];
    const last = segments[segments.length - 1];
    const stops = segments.length - 1;
    const productKey = flightProductKey(segments);
    return [
      {
        id: `flight-${legLabel}-${index}`,
        supplier: "duffel",
        supplierRef: `duffel:${offer.id}`,
        productKind: "flight" as const,
        title: `${from} to ${to}${stops === 0 ? ", direct" : `, ${stops} stop`}`,
        summary: `${offer.owner?.name ?? "Carrier"} flight, ${segments.length} segment(s).`,
        startsAt: zonedDateTime(withRealOffset(first.departing_at, departureZone)),
        endsAt: zonedDateTime(withRealOffset(last.arriving_at, arrivalZone)),
        costMinorUnits: minorUnits(Math.round(parseFloat(offer.total_amount) * rate * 100)),
        currency: "USD" as const,
        retrievedAt: stamped.retrievedAt,
        expiresAt: earlierOf(stamped.expiresAt, offer.expires_at),
        cancellationTerms: "Subject to fare rules at booking; not confirmed by this search.",
        synthetic: false,
        ...(productKey ? { productKey } : {}),
        marketKey: flightMarketKey(from, to, first.departing_at),
      },
    ];
  });
}

export async function searchFlights(brief: TripBrief): Promise<TravelOffer[]> {
  const [origin, destination] = await Promise.all([
    resolvePlace(brief.origin.city),
    resolvePlace(brief.destination.city),
  ]);
  const stamped = stamp();
  const [outbound, inbound] = await Promise.all([
    searchFlightLeg(
      origin.iata_code,
      destination.iata_code,
      dateOnly(brief.travelWindow.startsAt),
      brief.travelers,
      "outbound",
      origin.time_zone,
      destination.time_zone,
      stamped,
    ),
    searchFlightLeg(
      destination.iata_code,
      origin.iata_code,
      dateOnly(brief.travelWindow.endsAt),
      brief.travelers,
      "return",
      destination.time_zone,
      origin.time_zone,
      stamped,
    ),
  ]);
  return [...outbound, ...inbound];
}

function earlierOf(ours: string, theirs: string | undefined): string {
  if (!theirs || Number.isNaN(Date.parse(theirs))) return ours;
  return new Date(Math.min(Date.parse(ours), Date.parse(theirs))).toISOString();
}

function duffelOfferId(offer: TravelOffer): string {
  const id = offer.supplierRef.startsWith("duffel:") ? offer.supplierRef.slice("duffel:".length) : "";
  if (!id) throw new Error(`Offer ${offer.id} is not a Duffel offer.`);
  return id;
}

/**
 * Fetches the offer again from Duffel. Duffel answers 404 once an offer has
 * expired or been superseded, and the price can move between search and pay.
 */
export async function repriceFlight(offer: TravelOffer): Promise<RepriceResult> {
  let body: { data?: DuffelOffer };
  try {
    body = (await duffelFetch(`/air/offers/${encodeURIComponent(duffelOfferId(offer))}`)) as { data?: DuffelOffer };
  } catch (error) {
    if (error instanceof DuffelHttpError && (error.status === 404 || error.status === 410 || error.status === 422)) {
      return { status: "unavailable", reason: "This fare is no longer available." };
    }
    throw error;
  }
  const fresh = body.data;
  if (!fresh) return { status: "unavailable", reason: "This fare is no longer available." };
  if (fresh.expires_at && Date.parse(fresh.expires_at) <= Date.now()) {
    return { status: "unavailable", reason: "This fare has expired." };
  }

  const rate = await usdRate(fresh.total_currency);
  const costMinorUnits = minorUnits(Math.round(parseFloat(fresh.total_amount) * rate * 100));
  const { retrievedAt, expiresAt } = stamp();
  const updated: TravelOffer = { ...offer, costMinorUnits, retrievedAt, expiresAt: earlierOf(expiresAt, fresh.expires_at) };
  return costMinorUnits === offer.costMinorUnits
    ? { status: "unchanged", offer: updated }
    : { status: "changed", offer: updated, previousMinorUnits: offer.costMinorUnits };
}

export const duffelAdapter: SupplierAdapter = {
  name: "duffel",
  kinds: ["flight"],
  capability: "bookable",
  isConfigured: () => Boolean(process.env.DUFFEL_API_KEY),
  search: (brief) => searchFlights(brief),
  reprice: repriceFlight,
  // ponytail: still simulated. A real ticket is POST /air/orders with type
  // "instant", a "balance" payment and real passenger details (Phase E/F in
  // docs/backend-integration-guide.md). The idempotency key is ready for it.
  book: async (offer, context) => simulateBooking(offer, context.forceFail === true),
};
