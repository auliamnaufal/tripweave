import type { TripBrief } from "./tripBrief";

// The shape of a trip in time and space, derived from the brief alone, so
// every supplier searches the same legs and stays. A single-city trip is one
// stay with an outbound and a return flight; a multi-city trip adds a flight
// between each pair of stops.

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

type Place = { city: string; country: string };

export type Leg = { index: number; label: string; from: Place; to: Place; date: string };
export type Stay = { index: number; city: string; country: string; checkInMs: number; checkOutMs: number; firstDay: number; nights: number };

const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function stopsOf(brief: TripBrief): (Place & { nights: number })[] {
  if (brief.stops && brief.stops.length > 1) return brief.stops;
  const start = Date.parse(brief.travelWindow.startsAt);
  const end = Date.parse(brief.travelWindow.endsAt);
  return [{ ...brief.destination, nights: Math.max(1, Math.round((end - start) / DAY_MS)) }];
}

export function isMultiCity(brief: TripBrief): boolean {
  return Boolean(brief.stops && brief.stops.length > 1);
}

/** Where the traveller sleeps: one stay per stop, back to back. */
export function tripStays(brief: TripBrief): Stay[] {
  const start = Date.parse(brief.travelWindow.startsAt);
  const end = Date.parse(brief.travelWindow.endsAt);
  const stops = stopsOf(brief);
  let day = 0;
  return stops.map((stop, index) => {
    const firstDay = day;
    day += stop.nights;
    const last = index === stops.length - 1;
    return {
      index,
      city: stop.city,
      country: stop.country,
      // Afternoon check-in on arrival day, morning check-out on departure day.
      checkInMs: start + firstDay * DAY_MS + 15 * HOUR_MS,
      checkOutMs: last ? end - 10 * HOUR_MS : start + day * DAY_MS + 10 * HOUR_MS,
      firstDay: firstDay + 1,
      nights: stop.nights,
    };
  });
}

/** Every flight the trip needs, in order: out, between stops, home. */
export function tripLegs(brief: TripBrief): Leg[] {
  const start = Date.parse(brief.travelWindow.startsAt);
  const end = Date.parse(brief.travelWindow.endsAt);
  const stays = tripStays(brief);
  const legs: Leg[] = [{ index: 0, label: "outbound", from: brief.origin, to: stays[0], date: dateOf(start) }];
  for (let i = 1; i < stays.length; i++) {
    legs.push({ index: i, label: `leg${i}`, from: stays[i - 1], to: stays[i], date: dateOf(start + (stays[i].firstDay - 1) * DAY_MS) });
  }
  const last = stays[stays.length - 1];
  legs.push({ index: legs.length, label: "return", from: last, to: brief.origin, date: dateOf(end) });
  return legs.map((leg) => ({ ...leg, from: { city: leg.from.city, country: leg.from.country }, to: { city: leg.to.city, country: leg.to.country } }));
}

/** The stay that covers a given 1-based trip day (the last one for the final day). */
export function stayForDay(brief: TripBrief, day: number): Stay {
  const stays = tripStays(brief);
  return stays.find((stay) => day >= stay.firstDay && day < stay.firstDay + stay.nights) ?? stays[stays.length - 1];
}
