import type { TravelOfferView } from "@/features/planner/travelOffer";
import type { DealSummary } from "@/features/suppliers/deal";
import { getDestination, type DayItem, type Plan } from "@/features/ui-mock/destinations";
import { planView, type PlanView } from "@/features/ui-mock/planView";
import type { LivePlan } from "./liveStore";

// Maps the agent's real ItineraryPlan onto the view model the trip, checkout
// and booked screens already render. Catalog data only fills in what the API
// does not return yet (photos, ratings).

export type LiveView = PlanView & {
  live: true;
  offers: TravelOfferView[];
  note: string;
  status: "feasible" | "infeasible";
  source: string;
  quoteId?: string;
  deal?: DealSummary;
};

const usdFromMinor = (minor: number) => Math.round(minor / 100);

/** "08:15" from an ISO timestamp, read in the timestamp's own offset. */
function localTime(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}:${m[2]}` : "";
}

function duration(startIso: string, endIso: string): string {
  const mins = Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

function dayLabel(dateIso: string): string {
  return new Date(`${dateIso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function flightParts(offer: TravelOfferView) {
  const route = /^([A-Z]{3}) to ([A-Z]{3})(?:,\s*(.+))?$/.exec(offer.title);
  const airline = offer.summary.split(" flight")[0] || (offer.synthetic ? "Sample airline" : "Airline");
  const stopsRaw = route?.[3] ?? "";
  const stops = !stopsRaw || /direct/i.test(stopsRaw) ? "Nonstop" : stopsRaw.replace(/^\w/, (c) => c.toUpperCase());
  return { from: route?.[1] ?? "—", to: route?.[2] ?? "—", airline, stops };
}

function activityCatalogId(offerId: string): string {
  return offerId.split("-").slice(2).join("-");
}

export function liveView(live: LivePlan): LiveView {
  const base = planView(live.prefs);
  const dest = getDestination(live.prefs.destId);
  const offers = live.plan.offers;
  const flights = offers.filter((o) => o.productKind === "flight").sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const hotelOffer = offers.find((o) => o.productKind === "hotel");
  const activityOffers = offers.filter((o) => o.productKind === "activity");

  const flightRows = flights.map((f, i) => {
    const p = flightParts(f);
    return {
      id: f.id,
      date: i === 0 ? "Outbound" : "Return",
      depart: localTime(f.startsAt),
      arrive: localTime(f.endsAt),
      from: p.from,
      to: p.to,
      airline: p.airline,
      code: f.synthetic ? "Sample fare" : "Live fare",
      duration: duration(f.startsAt, f.endsAt),
      stops: p.stops,
      price: usdFromMinor(f.costMinorUnits),
    };
  });

  const catalogHotel = hotelOffer ? dest.hotels.find((h) => `hotel-${h.id}` === hotelOffer.id) : undefined;
  const nights = hotelOffer ? Math.max(1, Math.round((Date.parse(hotelOffer.endsAt) - Date.parse(hotelOffer.startsAt)) / 86_400_000)) : live.prefs.nights;
  const hotel = hotelOffer
    ? {
        name: hotelOffer.title,
        area: catalogHotel?.area ?? live.brief.destination.city,
        nights,
        rating: catalogHotel?.rating ?? 4.5,
        reviews: catalogHotel?.reviews ?? 0,
        image: catalogHotel?.image ?? "/images/h-book.webp",
        price: usdFromMinor(hotelOffer.costMinorUnits),
        perks: catalogHotel?.perks ?? [hotelOffer.cancellationTerms ?? "Sample stay"],
      }
    : { ...base.hotel, name: "No stay selected", price: 0, perks: ["The agent did not pick a stay for this plan"] };

  const activities = activityOffers.map((a) => {
    const c = dest.activities.find((x) => x.id === activityCatalogId(a.id));
    return {
      id: a.id,
      title: a.title,
      image: c?.image ?? "/images/m-rock.webp",
      price: usdFromMinor(a.costMinorUnits),
      rating: c?.rating ?? 4.5,
      tag: c?.category ?? "Activity",
    };
  });

  const days = live.plan.days.map((d, i) => {
    const items: DayItem[] = d.offers
      .slice()
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .map((o) => ({
        time: localTime(o.startsAt),
        kind: o.productKind,
        title: o.productKind === "hotel" ? `Check in at ${o.title}` : o.title,
        note: o.productKind === "flight" ? `${flightParts(o).airline} · ${duration(o.startsAt, o.endsAt)}` : o.summary.split(". ")[0],
      }));
    const act = d.offers.find((o) => o.productKind === "activity");
    const title = i === 0 ? "Arrive and settle in" : i === live.plan.days.length - 1 && d.offers.some((o) => o.productKind === "flight") ? "Fly home" : act ? act.title : "Free day";
    if (items.length === 0) items.push({ time: "10:00", kind: "free", title: "Nothing booked", note: "Left open on purpose" });
    return { day: i + 1, date: dayLabel(d.date), title, items };
  });

  const cat = (k: "flight" | "hotel" | "activity") => usdFromMinor(live.plan.budgetByCategory.find((b) => b.productKind === k)?.subtotalMinorUnits ?? 0);
  const start = new Date(live.brief.travelWindow.startsAt);
  const end = new Date(live.brief.travelWindow.endsAt);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return {
    ...base,
    live: true,
    offers,
    note: live.note,
    status: live.plan.status,
    source: live.source,
    quoteId: live.quoteId,
    deal: live.deal,
    total: usdFromMinor(live.plan.totalCostMinorUnits),
    title: `${nights} nights in ${dest.name}`,
    dates: `${fmt(start)} – ${fmt(end)}`,
    travelers: live.brief.travelers,
    budget: usdFromMinor(live.brief.hardBudget.amountMinorUnits),
    flights: flightRows.length ? flightRows : base.flights,
    hotel,
    days,
    activities,
    flightsTotal: cat("flight"),
    activitiesTotal: cat("activity"),
  };
}

/**
 * Overlays the live plan's real numbers onto a placeholder Plan, so the planner's
 * side panel and chat cards (written against Plan) show what the agent returned.
 */
export function overlayLive(plan: Plan, lv: LiveView | null): Plan {
  if (!lv) return plan;
  const [out] = lv.flights;
  return {
    ...plan,
    prefs: { ...plan.prefs, budget: lv.budget },
    originCode: out?.from ?? plan.originCode,
    flight: { ...plan.flight, airline: out?.airline ?? plan.flight.airline, stops: out?.stops ?? plan.flight.stops, price: lv.flightsTotal },
    hotel: { ...plan.hotel, name: lv.hotel.name, area: lv.hotel.area, price: lv.hotel.price },
    activities: lv.activities.map((a) => ({ id: a.id, title: a.title, duration: "", pricePerPerson: 0, rating: a.rating, image: a.image, category: a.tag, slot: "", price: a.price })),
    days: lv.days.map((d) => ({ day: d.day, title: d.title, items: d.items })),
    totals: { flights: lv.flightsTotal, hotel: lv.hotel.price, activities: lv.activitiesTotal, total: lv.total },
    underBy: lv.budget - lv.total,
  };
}
