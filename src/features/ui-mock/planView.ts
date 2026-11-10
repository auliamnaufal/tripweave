import { buildPlan, type Plan, type TripPrefs } from "./destinations";

/** Flattens a Plan into the shape the itinerary, checkout and booked screens render. */
export function planView(prefs: TripPrefs) {
  const plan: Plan = buildPlan(prefs);
  const { dest, flight, hotel } = plan;
  const perLeg = Math.round(flight.price / 2);
  return {
    plan,
    total: plan.totals.total,
    title: `${prefs.nights} nights in ${dest.name}`,
    place: `${dest.name}, ${dest.country}`,
    origin: prefs.origin,
    dates: prefs.when,
    travelers: prefs.travelers,
    budget: prefs.budget,
    hero: dest.hero,
    card: dest.card,
    flights: [
      { id: `${flight.id}-out`, date: "Outbound", depart: flight.depart, arrive: flight.arrive, from: plan.originCode, to: dest.airport, airline: flight.airline, code: flight.code, duration: flight.duration, stops: flight.stops, price: perLeg },
      { id: `${flight.id}-ret`, date: "Return", depart: flight.returnDepart, arrive: flight.returnArrive, from: dest.airport, to: plan.originCode, airline: flight.airline, code: flight.code.replace(/\d+$/, (n) => String(Number(n) + 1)), duration: flight.duration, stops: flight.stops, price: flight.price - perLeg },
    ],
    hotel: { name: hotel.name, area: hotel.area, nights: prefs.nights, rating: hotel.rating, reviews: hotel.reviews, image: hotel.image, price: hotel.price, perks: hotel.perks },
    days: plan.days.map((d) => ({ day: d.day, date: `Day ${d.day}`, title: d.title, items: d.items })),
    activities: plan.activities.map((a) => ({ id: a.id, title: a.title, image: a.image, price: a.price, rating: a.rating, tag: a.category })),
    flightsTotal: plan.totals.flights,
    activitiesTotal: plan.totals.activities,
  };
}

export type PlanView = ReturnType<typeof planView>;
