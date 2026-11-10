import type { TripBrief } from "@/features/planner/tripBrief";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";
import type { SupplierAdapter } from "./adapter";
import { flightMarketKey, resolveAirport } from "./duffel";

// Travelpayouts / Aviasales Data API: real fares other travellers found on
// Aviasales in the last days, cached per route and month. Not live and not
// bookable by Tripweave, so this is a deeplink source: it benchmarks the
// market ("someone sold this route for $172 on Trip.com") and every offer
// links to Aviasales with our affiliate marker.

type CachedFare = {
  origin: string;
  destination: string;
  origin_airport?: string;
  destination_airport?: string;
  price: number;
  airline: string;
  flight_number: string;
  departure_at: string;
  transfers: number;
  duration_to?: number;
  duration?: number;
  link: string;
  gate?: string;
};

function token(): string {
  const value = process.env.TRAVELPAYOUTS_TOKEN;
  if (!value) throw new Error("Travelpayouts is not configured.");
  return value;
}

async function monthFares(origin: string, destination: string, month: string): Promise<CachedFare[]> {
  const qs = new URLSearchParams({
    origin,
    destination,
    departure_at: month,
    one_way: "true",
    currency: "usd",
    sorting: "price",
    limit: "30",
  });
  const response = await fetch(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${qs}`, {
    headers: { "X-Access-Token": token(), Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Travelpayouts request failed (${response.status}).`);
  const body = (await response.json()) as { success?: boolean; data?: CachedFare[] };
  if (body.success === false) throw new Error("Travelpayouts returned an error.");
  return body.data ?? [];
}

function listingUrl(link: string): string {
  const marker = process.env.TRAVELPAYOUTS_MARKER;
  const url = new URL(link, "https://www.aviasales.com");
  if (marker) url.searchParams.set("marker", marker);
  return url.toString();
}

function toOffer(fare: CachedFare, from: string, to: string, leg: "out" | "ret", index: number, travelers: number): TravelOffer | null {
  const departs = Date.parse(fare.departure_at);
  if (!Number.isFinite(departs) || !(fare.price > 0) || !fare.link) return null;
  const minutes = fare.duration_to ?? fare.duration ?? 0;
  const retrievedAt = new Date().toISOString();
  const direct = fare.transfers === 0;
  return {
    id: `flight-tp-${leg}-${index}`,
    supplier: "aviasales",
    supplierRef: `aviasales:${fare.airline}${fare.flight_number}@${fare.departure_at}`,
    productKind: "flight",
    title: `${from} to ${to}${direct ? ", direct" : `, ${fare.transfers} stop`}`,
    summary: `${fare.airline}${fare.flight_number} on ${fare.departure_at.slice(0, 10)}${fare.gate ? ` · sold by ${fare.gate}` : ""} · fare seen on Aviasales recently, not a live price.`,
    startsAt: zonedDateTime(fare.departure_at),
    endsAt: zonedDateTime(new Date(departs + minutes * 60_000).toISOString()),
    // Aviasales prices one passenger; everything else in Tripweave is the party's total.
    costMinorUnits: minorUnits(Math.round(fare.price * 100) * travelers),
    currency: "USD",
    retrievedAt,
    expiresAt: new Date(Date.parse(retrievedAt) + 60 * 60_000).toISOString(),
    cancellationTerms: null,
    synthetic: false,
    listingUrl: listingUrl(fare.link),
    ...(direct ? { productKey: `flight:${fare.airline}${fare.flight_number}@${fare.departure_at.slice(0, 16)}` } : {}),
    marketKey: flightMarketKey(from, to, fare.departure_at),
  };
}

export async function searchMarketFares(brief: TripBrief): Promise<TravelOffer[]> {
  const [origin, destination] = await Promise.all([resolveAirport(brief.origin.city), resolveAirport(brief.destination.city)]);
  const from = origin.iata_code;
  const to = destination.iata_code;
  const [outbound, inbound] = await Promise.all([
    monthFares(from, to, brief.travelWindow.startsAt.slice(0, 7)),
    monthFares(to, from, brief.travelWindow.endsAt.slice(0, 7)),
  ]);
  return [
    ...outbound.map((fare, index) => toOffer(fare, from, to, "out", index, brief.travelers)),
    ...inbound.map((fare, index) => toOffer(fare, to, from, "ret", index, brief.travelers)),
  ].filter((offer): offer is TravelOffer => offer !== null);
}

export const travelpayoutsAdapter: SupplierAdapter = {
  name: "aviasales",
  kinds: ["flight"],
  capability: "deeplink",
  isConfigured: () => Boolean(process.env.TRAVELPAYOUTS_TOKEN && process.env.DUFFEL_API_KEY),
  search: async (brief, kind) => (kind === "flight" ? searchMarketFares(brief) : []),
  reprice: async () => {
    throw new Error("Aviasales fares are price information only.");
  },
  book: async () => {
    throw new Error("Aviasales fares are booked on Aviasales, not by Tripweave.");
  },
};
