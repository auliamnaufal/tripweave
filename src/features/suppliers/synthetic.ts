import type { TripBrief } from "@/features/planner/tripBrief";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";
import { findDestination, type Destination } from "@/features/ui-mock/destinations";
import type { SupplierAdapter } from "./adapter";
import { simulateBooking } from "./booking";

// ponytail: the destination catalog still lives with the UI placeholder data.
// Hotels and activities for the 7 catalog destinations come from there so the
// agent picks a Lisbon stay for Lisbon instead of a generic fixture. Unknown
// destinations fall back to the generic templates below. Move the catalog to
// its own module once real hotel/activity APIs (#11, #12) replace it.
function catalogFor(brief: TripBrief): Destination | undefined {
  return findDestination(`${brief.destination.city} ${brief.destination.country}`);
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
