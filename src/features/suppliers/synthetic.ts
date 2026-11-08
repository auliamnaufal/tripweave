import type { TripBrief } from "@/features/planner/tripBrief";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";

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
  const candidates = [
    makeOffer(
      "hotel-main",
      "hotel",
      "Waikiki guesthouse",
      "A simple sample stay near the beach.",
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
