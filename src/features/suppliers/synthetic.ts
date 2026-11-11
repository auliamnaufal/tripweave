import type { TripBrief } from "@/features/planner/tripBrief";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";
import { getDestination, type Destination } from "@/features/ui-mock/destinations";
import type { SupplierAdapter } from "./adapter";
import { isMultiCity, stayForDay, tripStays } from "@/features/planner/itinerary";
import { simulateBooking } from "./booking";

// ponytail: the destination catalog still lives with the UI placeholder data.
// Hotels and activities for the 7 catalog destinations come from there so the
// agent picks a Lisbon stay for Lisbon instead of a generic fixture. Unknown
// destinations fall back to the generic templates below. Move the catalog to
// its own module once real hotel/activity APIs (#11, #12) replace it.
function catalogFor(brief: TripBrief): Destination | undefined {
  return localCatalog(brief.destination.city, { viaGateway: true });
}

// The places each catalog's hotels and activities are actually in. The UI's
// keywords are broader on purpose ("tokyo" opens the Japan destination in the
// chat), but a Tokyo stay must not be sold Kyoto's Gion food tour or ryokan.
// A city outside these gets the generic, city-named fixtures instead.
const CATALOG_PLACES: Record<string, readonly string[]> = {
  oahu: ["oahu", "honolulu", "waikiki", "north shore", "hawaii"],
  kyoto: ["kyoto"],
  lisbon: ["lisbon", "lisboa", "sintra"],
  patagonia: ["el chaltén", "el chalten", "chaltén", "chalten", "el calafate", "calafate", "patagonia"],
  bali: ["ubud", "bali", "denpasar", "canggu", "seminyak"],
  amalfi: ["positano", "amalfi", "ravello", "praiano"],
  iceland: ["south iceland", "iceland", "vík", "vik", "selfoss"],
};

// A catalog trip's brief names the city it flies into (see flightCity in
// features/live/client.ts): a Kyoto trip lands in Osaka, an Amalfi one in
// Naples. That city stands for the catalog only when it is the whole trip,
// never as one stop of a multi-city trip, where the traveller sleeps there.
const GATEWAYS: Record<string, string> = { osaka: "kyoto", naples: "amalfi", reykjavik: "iceland", reykjavík: "iceland" };

/** The catalog destination whose own hotels and activities are in `city`, if any. */
export function localCatalog(city: string, options: { viaGateway?: boolean } = {}): Destination | undefined {
  const place = city.trim().toLowerCase();
  const id = Object.keys(CATALOG_PLACES).find((key) => CATALOG_PLACES[key].includes(place)) ?? (options.viaGateway ? GATEWAYS[place] : undefined);
  return id ? getDestination(id) : undefined;
}

function parseHours(duration: string): number {
  if (duration.toLowerCase().includes("full")) return 8;
  const n = Number.parseFloat(duration);
  return Number.isFinite(n) && n > 0 ? n : 2;
}

function parseSlot(slot: string): number {
  const [h, m] = slot.split(":").map(Number);
  return (h || 0) + (m || 0) / 60;
}

const hourMs = 3_600_000;

function iso(millis: number): string {
  return new Date(millis).toISOString();
}

function makeOffer(
  id: string,
  productKind: TravelOffer["productKind"],
  title: string,
  summary: string,
  startsAtMs: number,
  endsAtMs: number,
  costMinorUnits: number,
  retrievedAt: string,
  expiresAt: string,
): TravelOffer {
  return {
    id,
    supplier: "synthetic",
    supplierRef: `synthetic:${id}`,
    productKind,
    title,
    summary,
    startsAt: zonedDateTime(iso(startsAtMs)),
    endsAt: zonedDateTime(iso(endsAtMs)),
    costMinorUnits: minorUnits(costMinorUnits),
    currency: "USD",
    retrievedAt,
    expiresAt,
    cancellationTerms: "Fully refundable within 24 hours (synthetic).",
    synthetic: true,
    // Stays and activities can be resold by partners and compared; sample
    // flights never are (real flights come from Duffel).
    ...(productKind === "flight" ? {} : { productKey: `${productKind}:synthetic-${id}@${iso(startsAtMs).slice(0, 10)}` }),
  };
}

function stamp(now: () => Date): { retrievedAt: string; expiresAt: string } {
  const retrievedAt = now().toISOString();
  const expiresAt = new Date(Date.parse(retrievedAt) + 15 * 60_000).toISOString();
  return { retrievedAt, expiresAt };
}

function withinWindow(brief: TripBrief, startsAtMs: number, endsAtMs: number): boolean {
  return (
    startsAtMs >= Date.parse(brief.travelWindow.startsAt) &&
    endsAtMs <= Date.parse(brief.travelWindow.endsAt)
  );
}

export function searchFlights(brief: TripBrief, now: () => Date = () => new Date()): TravelOffer[] {
  const { retrievedAt, expiresAt } = stamp(now);
  const start = Date.parse(brief.travelWindow.startsAt);
  const end = Date.parse(brief.travelWindow.endsAt);
  const candidates = [
    makeOffer(
      "flight-arrival",
      "flight",
      "Direct arrival flight",
      "A direct sample flight into the destination.",
      start + 8 * hourMs,
      start + 11 * hourMs,
      62000,
      retrievedAt,
      expiresAt,
    ),
    makeOffer(
      "flight-departure",
      "flight",
      "Direct return flight",
      "A direct sample flight home.",
      end - 12 * hourMs,
      end - 4 * hourMs,
      62000,
      retrievedAt,
      expiresAt,
    ),
  ];
  return candidates.filter((offer) =>
    withinWindow(brief, Date.parse(offer.startsAt), Date.parse(offer.endsAt)),
  );
}

export function searchHotels(brief: TripBrief, now: () => Date = () => new Date()): TravelOffer[] {
  if (isMultiCity(brief)) return multiCityHotels(brief, now);
  const { retrievedAt, expiresAt } = stamp(now);
  const start = Date.parse(brief.travelWindow.startsAt);
  const end = Date.parse(brief.travelWindow.endsAt);
  const catalog = catalogFor(brief);
  if (catalog) {
    const checkIn = start + 15 * hourMs;
    const checkOut = end - 10 * hourMs;
    const nights = Math.max(1, Math.round((checkOut - checkIn) / (24 * hourMs)));
    const rooms = brief.travelers > 2 ? Math.ceil(brief.travelers / 2) : 1;
    return catalog.hotels
      .map((hotel) =>
        makeOffer(
          `hotel-${hotel.id}`,
          "hotel",
          hotel.name,
          `${hotel.area}, ${catalog.name}. Rated ${hotel.rating} (${hotel.reviews} reviews). ${hotel.nightly}/night x ${nights} nights${rooms > 1 ? ` x ${rooms} rooms` : ""}. ${hotel.perks.join("; ")}.`,
          checkIn,
          checkOut,
          hotel.nightly * nights * rooms * 100,
          retrievedAt,
          expiresAt,
        ),
      )
      .filter((offer) => withinWindow(brief, Date.parse(offer.startsAt), Date.parse(offer.endsAt)));
  }
  const candidates = [
    makeOffer(
      "hotel-main",
      "hotel",
      `${brief.destination.city} guesthouse`,
      "A simple sample stay in a central neighbourhood.",
      start + 15 * hourMs,
      end - 10 * hourMs,
      95000,
      retrievedAt,
      expiresAt,
    ),
  ];
  return candidates.filter((offer) =>
    withinWindow(brief, Date.parse(offer.startsAt), Date.parse(offer.endsAt)),
  );
}

type ActivityTemplate = {
  slug: string;
  title: string;
  summary: string;
  hourOffset: number;
  durationHours: number;
  costMinorUnits: number;
};

const activityTemplates: ActivityTemplate[] = [
  {
    slug: "beach",
    title: "Beach afternoon",
    summary: "A free afternoon at the beach.",
    hourOffset: 12,
    durationHours: 2,
    costMinorUnits: 0,
  },
  {
    slug: "hike",
    title: "Guided ridge walk",
    summary: "A short guided walk on a coastal ridge.",
    hourOffset: 8,
    durationHours: 3,
    costMinorUnits: 2500,
  },
  {
    slug: "food",
    title: "Local food tasting",
    summary: "An evening of local food stops.",
    hourOffset: 18,
    durationHours: 2,
    costMinorUnits: 18000,
  },
  {
    slug: "market",
    title: "Museum and market visit",
    summary: "A stroll through the local museum and market.",
    hourOffset: 11,
    durationHours: 3,
    costMinorUnits: 4000,
  },
  {
    slug: "sunset",
    title: "Sunset viewpoint",
    summary: "An evening watching the sunset from a scenic overlook.",
    hourOffset: 17,
    durationHours: 1,
    costMinorUnits: 1500,
  },
  {
    slug: "cooking",
    title: "Evening cooking class",
    summary: "A hands-on class in local cuisine.",
    hourOffset: 21,
    durationHours: 2,
    costMinorUnits: 9000,
  },
];

export function searchActivities(brief: TripBrief, now: () => Date = () => new Date()): TravelOffer[] {
  return [...(isMultiCity(brief) ? multiCityActivities(brief, now) : singleCityActivities(brief, now)), ...requestedActivities(brief, now)];
}

function singleCityActivities(brief: TripBrief, now: () => Date): TravelOffer[] {
  const { retrievedAt, expiresAt } = stamp(now);
  const start = Date.parse(brief.travelWindow.startsAt);
  const end = Date.parse(brief.travelWindow.endsAt);
  const numDays = Math.round((end - start) / (24 * hourMs));
  const catalog = catalogFor(brief);
  if (catalog) {
    // Each catalog activity is offered on every middle day, so the agent can
    // place it around the real flight times without schedule conflicts.
    const offers: TravelOffer[] = [];
    for (let day = 1; day < numDays; day++) {
      for (const activity of catalog.activities) {
        const begin = start + day * 24 * hourMs + parseSlot(activity.slot) * hourMs;
        offers.push(
          makeOffer(
            `activity-${day}-${activity.id}`,
            "activity",
            activity.title,
            `${activity.category} in ${catalog.name}, ${activity.duration}. Rated ${activity.rating}. ${activity.pricePerPerson ? `${activity.pricePerPerson} per person` : "Free"}.`,
            begin,
            begin + parseHours(activity.duration) * hourMs,
            activity.pricePerPerson * brief.travelers * 100,
            retrievedAt,
            expiresAt,
          ),
        );
      }
    }
    return offers.filter((offer) => withinWindow(brief, Date.parse(offer.startsAt), Date.parse(offer.endsAt)));
  }
  const candidates = Array.from({ length: numDays }, (_, day) => {
    const template = activityTemplates[day % activityTemplates.length];
    const dayStart = start + day * 24 * hourMs;
    return makeOffer(
      `activity-${day}-${template.slug}`,
      "activity",
      template.title,
      template.summary,
      dayStart + template.hourOffset * hourMs,
      dayStart + (template.hourOffset + template.durationHours) * hourMs,
      template.costMinorUnits,
      retrievedAt,
      expiresAt,
    );
  });
  return candidates.filter((offer) =>
    withinWindow(brief, Date.parse(offer.startsAt), Date.parse(offer.endsAt)),
  );
}

/** One stay per stop: the catalog's hotels where the city has them, a sample hotel otherwise. */
function multiCityHotels(brief: TripBrief, now: () => Date): TravelOffer[] {
  const { retrievedAt, expiresAt } = stamp(now);
  return tripStays(brief).flatMap((stay) => {
    const catalog = localCatalog(stay.city);
    const rooms = brief.travelers > 2 ? Math.ceil(brief.travelers / 2) : 1;
    const options = catalog
      ? catalog.hotels.map((hotel) => ({ id: hotel.id, name: hotel.name, area: hotel.area, nightly: hotel.nightly }))
      : [
          { id: "central", name: `${stay.city} central hotel`, area: "City centre", nightly: 160 },
          { id: "boutique", name: `${stay.city} boutique stay`, area: "Old town", nightly: 210 },
        ];
    return options.map((hotel) =>
      makeOffer(
        `hotel-s${stay.index}-${hotel.id}`,
        "hotel",
        hotel.name,
        `${hotel.area}, ${stay.city}. ${hotel.nightly}/night x ${stay.nights} nights${rooms > 1 ? ` x ${rooms} rooms` : ""}.`,
        stay.checkInMs,
        stay.checkOutMs,
        hotel.nightly * stay.nights * rooms * 100,
        retrievedAt,
        expiresAt,
      ),
    );
  });
}

/** Activities on each stop's own days, from the catalog where the city has one. */
function multiCityActivities(brief: TripBrief, now: () => Date): TravelOffer[] {
  const { retrievedAt, expiresAt } = stamp(now);
  const start = Date.parse(brief.travelWindow.startsAt);
  const offers: TravelOffer[] = [];
  for (const stay of tripStays(brief)) {
    const catalog = localCatalog(stay.city);
    for (let day = stay.firstDay; day < stay.firstDay + stay.nights; day++) {
      const dayStart = start + (day - 1) * 24 * hourMs;
      if (catalog) {
        for (const activity of catalog.activities) {
          const begin = dayStart + parseSlot(activity.slot) * hourMs;
          offers.push(makeOffer(`activity-${day}-${activity.id}`, "activity", activity.title, `${activity.category} in ${stay.city}, ${activity.duration}.`, begin, begin + parseHours(activity.duration) * hourMs, activity.pricePerPerson * brief.travelers * 100, retrievedAt, expiresAt));
        }
      } else {
        const template = activityTemplates[day % activityTemplates.length];
        offers.push(makeOffer(`activity-${day}-${template.slug}`, "activity", `${template.title}, ${stay.city}`, template.summary, dayStart + template.hourOffset * hourMs, dayStart + (template.hourOffset + template.durationHours) * hourMs, template.costMinorUnits, retrievedAt, expiresAt));
      }
    }
  }
  return offers.filter((offer) => withinWindow(brief, Date.parse(offer.startsAt), Date.parse(offer.endsAt)));
}

const DAY_TRIP = /\b(fuji|mount|mt\.?|day trip|excursion|hike|trek|safari|island|volcano|national park)\b/i;
const TOUR = /\b(tour|temple|shrine|castle|palace|museum|market|walk|cruise|show|class)\b/i;
const FOOD = /\b(food|eat|dinner|lunch|street food|ramen|sushi|tasting|cafe)\b/i;

/**
 * What the traveller asked for on a given day ("Day 3: Mount Fuji") becomes a
 * bookable local-operator activity on that day, so the agent can honour it.
 * Arrival and departure days get a shorter, later or earlier slot.
 */
function requestedActivities(brief: TripBrief, now: () => Date): TravelOffer[] {
  if (!brief.dayPlans?.length) return [];
  const { retrievedAt, expiresAt } = stamp(now);
  const start = Date.parse(brief.travelWindow.startsAt);
  const totalDays = Math.round((Date.parse(brief.travelWindow.endsAt) - start) / (24 * hourMs)) + 1;
  return brief.dayPlans
    .filter((plan) => plan.day >= 1 && plan.day <= totalDays)
    .map((plan) => {
      const stay = stayForDay(brief, plan.day);
      const dayStart = start + (plan.day - 1) * 24 * hourMs;
      const dayTrip = DAY_TRIP.test(plan.wish);
      const perPerson = dayTrip ? 120 : TOUR.test(plan.wish) ? 55 : FOOD.test(plan.wish) ? 45 : 40;
      const first = plan.day === 1;
      const last = plan.day === totalDays;
      const [from, hours] = first ? [16, 3] : last ? [8, 2] : dayTrip ? [8, 9] : [10, 3];
      const slug = plan.wish.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "request";
      const title = plan.wish.charAt(0).toUpperCase() + plan.wish.slice(1);
      return makeOffer(
        `activity-${plan.day}-wish-${slug}`,
        "activity",
        dayTrip && !/trip|tour/i.test(title) ? `${title} day trip` : title,
        `You asked for this on day ${plan.day}. ${dayTrip ? "Full-day guided trip with transport" : "Guided, about 3 hours"} from ${stay.city}. ${perPerson} per person.`,
        dayStart + from * hourMs,
        dayStart + (from + hours) * hourMs,
        perPerson * brief.travelers * 100,
        retrievedAt,
        expiresAt,
      );
    })
    .filter((offer) => withinWindow(brief, Date.parse(offer.startsAt), Date.parse(offer.endsAt)));
}

export function searchAllOffers(brief: TripBrief, now?: () => Date): TravelOffer[] {
  return [
    ...searchFlights(brief, now),
    ...searchHotels(brief, now),
    ...searchActivities(brief, now),
  ];
}

const syntheticSearch = { flight: searchFlights, hotel: searchHotels, activity: searchActivities } as const;

/**
 * Sample data for every kind. The registry uses it as the only hotel and
 * activity source until a real API is approved, and never for flights unless
 * configured as a fallback. Prices never move, so reprice only refreshes the stamp.
 */
export function createSyntheticAdapter(now: () => Date = () => new Date()): SupplierAdapter {
  return {
    name: "synthetic",
    kinds: ["flight", "hotel", "activity"],
    capability: "bookable",
    isConfigured: () => true,
    search: async (brief, kind) => syntheticSearch[kind](brief, now),
    reprice: async (offer) => ({ status: "unchanged", offer: { ...offer, ...stamp(now) } }),
    book: async (offer, context) => simulateBooking(offer, context.forceFail === true),
  };
}

export const syntheticAdapter = createSyntheticAdapter();
