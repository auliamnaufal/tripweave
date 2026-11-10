import type { TripBrief } from "@/features/planner/tripBrief";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";
import type { RepriceResult, SupplierAdapter } from "./adapter";
import type { BookingResult } from "./booking";
import { resolveAirport } from "./duffel";

// LiteAPI (Nuitée): real hotel inventory with a full search → prebook → book
// flow. With a sandbox key (sand_…) the booking is confirmed by LiteAPI but
// nothing is reserved and no money moves, which is exactly what the demo needs.

const DATA = "https://api.liteapi.travel/v3.0";
const BOOK = "https://book.liteapi.travel/v3.0";
const HOTELS_PER_SEARCH = 8;
const hourMs = 3_600_000;

function apiKey(): string {
  const key = process.env.LITEAPI_KEY;
  if (!key) throw new Error("LiteAPI is not configured.");
  return key;
}

class LiteApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | undefined,
    message: string,
  ) {
    super(message);
  }
}

async function liteFetch(url: string, body?: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-API-Key": apiKey(), accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = (await response.json().catch(() => null)) as { error?: { code?: number; message?: string } } | null;
  if (!response.ok || json?.error) {
    throw new LiteApiError(response.status, json?.error?.code, json?.error?.message ?? `LiteAPI request failed (${response.status}).`);
  }
  return json;
}

type Hotel = { id: string; name: string; stars?: number; rating?: number; reviewCount?: number; address?: string; main_photo?: string };
type Rate = {
  name?: string;
  boardName?: string;
  retailRate?: { total?: { amount: number; currency: string }[] };
  cancellationPolicies?: { refundableTag?: string; cancelPolicyInfos?: { cancelTime?: string }[] };
};
type RoomType = { offerId: string; rates: Rate[]; offerRetailRate?: { amount: number; currency: string } };
type HotelRates = { hotelId: string; roomTypes: RoomType[] };

/** Two adults per room, the usual default for a party. */
function occupancies(travelers: number): { adults: number }[] {
  const rooms = Math.max(1, Math.ceil(travelers / 2));
  return Array.from({ length: rooms }, (_, i) => ({ adults: i < rooms - 1 ? 2 : travelers - 2 * (rooms - 1) }));
}

function stayDates(brief: TripBrief) {
  const start = Date.parse(brief.travelWindow.startsAt);
  const end = Date.parse(brief.travelWindow.endsAt);
  // Same check-in/check-out shape as the synthetic stays: afternoon in, morning out.
  const checkInMs = start + 15 * hourMs;
  const checkOutMs = end - 10 * hourMs;
  return {
    checkInMs,
    checkOutMs,
    checkin: new Date(checkInMs).toISOString().slice(0, 10),
    checkout: new Date(checkOutMs).toISOString().slice(0, 10),
  };
}

function cancellationText(rate: Rate): string {
  if (rate.cancellationPolicies?.refundableTag !== "RFN") return "Non-refundable.";
  const until = rate.cancellationPolicies.cancelPolicyInfos?.[0]?.cancelTime;
  return until ? `Free cancellation until ${until} GMT.` : "Refundable.";
}

export async function searchHotels(brief: TripBrief): Promise<TravelOffer[]> {
  const destination = await resolveAirport(brief.destination.city);
  if (!destination.country_code) throw new Error(`No country code for ${brief.destination.city}.`);
  const qs = new URLSearchParams({ countryCode: destination.country_code, cityName: brief.destination.city, limit: String(HOTELS_PER_SEARCH) });
  const hotels = ((await liteFetch(`${DATA}/data/hotels?${qs}`)) as { data?: Hotel[] }).data ?? [];
  if (hotels.length === 0) return [];

  const { checkInMs, checkOutMs, checkin, checkout } = stayDates(brief);
  const party = occupancies(brief.travelers);
  const rates =
    ((await liteFetch(`${DATA}/hotels/rates`, {
      hotelIds: hotels.map((hotel) => hotel.id),
      checkin,
      checkout,
      currency: "USD",
      guestNationality: "US",
      occupancies: party,
      maxRatesPerHotel: 1,
    })) as { data?: HotelRates[] }).data ?? [];

  const byId = new Map(hotels.map((hotel) => [hotel.id, hotel]));
  const retrievedAt = new Date().toISOString();
  const nights = Math.max(1, Math.round((checkOutMs - checkInMs) / (24 * hourMs)));
  const offers: TravelOffer[] = [];
  for (const entry of rates) {
    const hotel = byId.get(entry.hotelId);
    const room = entry.roomTypes?.[0];
    const rate = room?.rates?.[0];
    const total = room?.offerRetailRate ?? rate?.retailRate?.total?.[0];
    if (!hotel || !room?.offerId || !rate || !total || total.currency !== "USD" || !(total.amount > 0)) continue;
    offers.push({
      id: `hotel-lite-${hotel.id}`,
      supplier: "liteapi",
      supplierRef: `liteapi:${room.offerId}`,
      productKind: "hotel",
      title: hotel.name,
      summary: [
        hotel.stars ? `${hotel.stars}★` : null,
        hotel.rating ? `rated ${hotel.rating}${hotel.reviewCount ? ` (${hotel.reviewCount} reviews)` : ""}` : null,
        hotel.address,
        `${rate.name ?? "Room"}${rate.boardName ? `, ${rate.boardName}` : ""}`,
        `${nights} night${nights === 1 ? "" : "s"}${party.length > 1 ? ` × ${party.length} rooms` : ""}`,
      ]
        .filter(Boolean)
        .join(" · "),
      startsAt: zonedDateTime(new Date(checkInMs).toISOString()),
      endsAt: zonedDateTime(new Date(checkOutMs).toISOString()),
      costMinorUnits: minorUnits(Math.round(total.amount * 100)),
      currency: "USD",
      retrievedAt,
      expiresAt: new Date(Date.parse(retrievedAt) + 15 * 60_000).toISOString(),
      cancellationTerms: cancellationText(rate),
      synthetic: false,
      productKey: `hotel:liteapi-${hotel.id}@${checkin}_${checkout}_${party.map((o) => o.adults).join("-")}`,
      marketKey: `hotel-market:${brief.destination.city.toLowerCase()}@${checkin}_${checkout}`,
    });
  }
  return offers;
}

function offerIdOf(offer: TravelOffer): string {
  if (!offer.supplierRef.startsWith("liteapi:")) throw new Error(`Offer ${offer.id} is not a LiteAPI offer.`);
  return offer.supplierRef.slice("liteapi:".length);
}

async function prebook(offer: TravelOffer): Promise<{ prebookId: string; price: number; currency: string }> {
  const body = (await liteFetch(`${BOOK}/rates/prebook`, { offerId: offerIdOf(offer), usePaymentSdk: false })) as {
    data?: { prebookId?: string; price?: number; currency?: string };
  };
  if (!body.data?.prebookId || typeof body.data.price !== "number") throw new Error("LiteAPI prebook returned no price.");
  return { prebookId: body.data.prebookId, price: body.data.price, currency: body.data.currency ?? "USD" };
}

/** Prebook is LiteAPI's own "is this still the price?" check. */
export async function repriceHotel(offer: TravelOffer): Promise<RepriceResult> {
  let checked: Awaited<ReturnType<typeof prebook>>;
  try {
    checked = await prebook(offer);
  } catch (error) {
    if (error instanceof LiteApiError && error.status >= 400 && error.status < 500) {
      return { status: "unavailable", reason: "This room is no longer available at this rate." };
    }
    throw error;
  }
  if (checked.currency !== "USD") return { status: "unavailable", reason: "This rate is no longer offered in USD." };
  const costMinorUnits = minorUnits(Math.round(checked.price * 100));
  const retrievedAt = new Date().toISOString();
  const updated: TravelOffer = { ...offer, costMinorUnits, retrievedAt, expiresAt: new Date(Date.parse(retrievedAt) + 15 * 60_000).toISOString() };
  return costMinorUnits === offer.costMinorUnits
    ? { status: "unchanged", offer: updated }
    : { status: "changed", offer: updated, previousMinorUnits: offer.costMinorUnits };
}

// The traveller's identity isn't collected in this demo (see README), so the
// booking holder is a fixed placeholder on a reserved example domain.
const DEMO_GUEST = { firstName: "Demo", lastName: "Traveller", email: "guest@tripweave.example", phone: "+15550100" };

/** Rooms in the offer, from the occupancy suffix of its product key (`…_2-1` is two rooms). */
function roomCount(offer: TravelOffer): number {
  const occupancy = offer.productKey?.split("_").at(-1) ?? "";
  return Math.max(1, occupancy.split("-").filter(Boolean).length);
}

/** LiteAPI's clientReference is the idempotency key: a repeat returns error 4005 instead of a second booking. */
function clientReference(idempotencyKey: string): string {
  return idempotencyKey.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 100);
}

export async function bookHotel(offer: TravelOffer, idempotencyKey: string, forceFail: boolean): Promise<BookingResult> {
  if (forceFail) return { offerId: offer.id, status: "failed", reason: "Price or availability changed before booking (simulated)." };
  const reference = clientReference(idempotencyKey);
  const { prebookId } = await prebook(offer);
  try {
    const body = (await liteFetch(`${BOOK}/rates/book`, {
      prebookId,
      clientReference: reference,
      holder: DEMO_GUEST,
      payment: { method: "ACC_CREDIT_CARD" },
      // LiteAPI wants one lead guest per room (occupancy).
      guests: Array.from({ length: roomCount(offer) }, (_, index) => ({
        occupancyNumber: index + 1,
        firstName: DEMO_GUEST.firstName,
        lastName: DEMO_GUEST.lastName,
        email: DEMO_GUEST.email,
      })),
    })) as { data?: { bookingId?: string; status?: string } };
    if (body.data?.status !== "CONFIRMED" || !body.data.bookingId) {
      return { offerId: offer.id, status: "failed", reason: "The hotel did not confirm the booking." };
    }
    return { offerId: offer.id, status: "booked", bookingRef: `LITEAPI-${body.data.bookingId}` };
  } catch (error) {
    // Already booked under this exact key by an earlier attempt: that booking stands.
    if (error instanceof LiteApiError && error.code === 4005) {
      return { offerId: offer.id, status: "booked", bookingRef: `LITEAPI-REF-${reference}` };
    }
    throw error;
  }
}

export const liteApiAdapter: SupplierAdapter = {
  name: "liteapi",
  kinds: ["hotel"],
  capability: "bookable",
  isConfigured: () => Boolean(process.env.LITEAPI_KEY && process.env.DUFFEL_API_KEY),
  search: async (brief, kind) => (kind === "hotel" ? searchHotels(brief) : []),
  reprice: repriceHotel,
  book: (offer, context) => bookHotel(offer, context.idempotencyKey, context.forceFail === true),
};
