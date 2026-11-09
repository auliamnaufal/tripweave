import type { CategoryBudget, DayPlan, ItineraryPlan, OfferViolation, TravelOffer } from "./travelOffer";
import type { TripBrief } from "./tripBrief";
import { minorUnits } from "./types";

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function buildDays(brief: TripBrief, offers: readonly TravelOffer[]): DayPlan[] {
  const byDate = new Map<string, TravelOffer[]>();
  const startDate = new Date(`${dateOnly(brief.travelWindow.startsAt)}T00:00:00.000Z`).getTime();
  const endDate = new Date(`${dateOnly(brief.travelWindow.endsAt)}T00:00:00.000Z`).getTime();
  for (let day = startDate; day <= endDate; day += 86_400_000) {
    byDate.set(new Date(day).toISOString().slice(0, 10), []);
  }
  for (const offer of offers) {
    const date = dateOnly(offer.startsAt);
    const bucket = byDate.get(date);
    if (bucket) bucket.push(offer);
    else byDate.set(date, [offer]);
  }
  return [...byDate.entries()].map(([date, dayOffers]) => ({
    date,
    offers: dayOffers,
    subtotalMinorUnits: minorUnits(dayOffers.reduce((sum, offer) => sum + offer.costMinorUnits, 0)),
  }));
}

function buildBudgetByCategory(offers: readonly TravelOffer[]): CategoryBudget[] {
  const kinds: TravelOffer["productKind"][] = ["flight", "hotel", "activity"];
  return kinds.map((productKind) => ({
    productKind,
    subtotalMinorUnits: minorUnits(
      offers
        .filter((offer) => offer.productKind === productKind)
        .reduce((sum, offer) => sum + offer.costMinorUnits, 0),
    ),
  }));
}

export function selectOffers(available: readonly TravelOffer[], ids: readonly string[]): TravelOffer[] {
  const byId = new Map(available.map((offer) => [offer.id, offer]));
  return ids.map((id) => {
    const offer = byId.get(id);
    if (!offer) throw new Error(`Unknown offer id: ${id}`);
    return offer;
  });
}

export function buildItinerary(brief: TripBrief, offers: readonly TravelOffer[]): ItineraryPlan {
  const totalCostMinorUnits = minorUnits(
    offers.reduce((sum, offer) => sum + offer.costMinorUnits, 0),
  );
  const budgetMinorUnits = brief.hardBudget.amountMinorUnits;
  const windowStart = Date.parse(brief.travelWindow.startsAt);
  const windowEnd = Date.parse(brief.travelWindow.endsAt);
  const violations: OfferViolation[] = [];

  if (totalCostMinorUnits > budgetMinorUnits) {
    violations.push({ kind: "over-budget", totalCostMinorUnits, budgetMinorUnits });
  }

  const overlapCandidates: TravelOffer[] = [];
  for (const offer of offers) {
    const start = Date.parse(offer.startsAt);
    const end = Date.parse(offer.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      violations.push({ kind: "invalid-time-range", offerId: offer.id });
      continue;
    }
    if (start < windowStart || end > windowEnd) {
      violations.push({ kind: "outside-trip-window", offerId: offer.id });
    }
    if (offer.productKind !== "hotel") {
      overlapCandidates.push(offer);
    }
  }

  overlapCandidates.sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
  for (let firstIndex = 0; firstIndex < overlapCandidates.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < overlapCandidates.length; secondIndex += 1) {
      const first = overlapCandidates[firstIndex];
      const second = overlapCandidates[secondIndex];
      if (Date.parse(second.startsAt) >= Date.parse(first.endsAt)) break;
      violations.push({
        kind: "schedule-conflict",
        firstOfferId: first.id,
        secondOfferId: second.id,
      });
    }
  }

  const feasible = violations.length === 0;
  return {
    offers: [...offers],
    totalCostMinorUnits,
    status: feasible ? "feasible" : "infeasible",
    budgetRemainingMinorUnits: feasible
      ? minorUnits(budgetMinorUnits - totalCostMinorUnits)
      : null,
    violations,
    days: buildDays(brief, offers),
    budgetByCategory: buildBudgetByCategory(offers),
  };
}
