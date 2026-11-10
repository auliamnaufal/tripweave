import { origins, type Destination, type Plan, type TripPrefs } from "./destinations";

// Template questions the agent asks after the traveller names a place.
// Each answer is parsed into TripPrefs; typed free text is accepted too.

export type QuestionId = "origin" | "when" | "who" | "budget" | "vibe";

export type Question = {
  id: QuestionId;
  ask: (dest: Destination, prefs: TripPrefs) => string;
  options: string[];
  multi?: boolean;
  placeholder: string;
};

export const questions: Question[] = [
  {
    id: "origin",
    ask: () => "Where will you be flying from?",
    options: origins.map((o) => o.city),
    placeholder: "Your home city or airport…",
  },
  {
    id: "when",
    ask: (d) => `When are you thinking, and for how long? ${d.bestTime.split(":")[0]} is the sweet spot.`,
    options: ["Next month · 5 nights", "This spring · 1 week", "A long weekend", "I’m flexible"],
    placeholder: "e.g. mid-March for 6 nights…",
  },
  {
    id: "who",
    ask: () => "Who’s coming along?",
    options: ["Just me", "Two of us", "Family with kids", "A group of friends"],
    placeholder: "e.g. me and my partner…",
  },
  {
    id: "budget",
    ask: () => "What’s the most you want to spend in total, flights included? I’ll treat it as a hard line.",
    options: ["Under $2,000", "Around $3,000", "Around $5,000", "No hard limit"],
    placeholder: "e.g. $2,500…",
  },
  {
    id: "vibe",
    ask: () => "Last one. What should this trip feel like? Pick a few.",
    options: ["Slow mornings", "Food first", "Big hikes", "Beaches", "Culture", "Nightlife"],
    multi: true,
    placeholder: "Anything else I should know…",
  },
];

export const acknowledgements: Record<QuestionId, (answer: string, dest: Destination) => string> = {
  origin: (a, d) => `${a} to ${d.airport}, noted.`,
  when: (a) => (a.toLowerCase().includes("flexible") ? "Flexible helps, I can chase the cheaper dates." : "Got it."),
  who: (a) => (a.toLowerCase().includes("kid") ? "I’ll keep the days gentle and the flights sensible." : "Perfect."),
  budget: (a) => (a.toLowerCase().includes("no hard") ? "No hard line, I’ll still keep it sensible." : "That’s my ceiling, I won’t cross it."),
  vibe: () => "Lovely.",
};

export function applyAnswer(prefs: TripPrefs, id: QuestionId, answer: string, dest: Destination): TripPrefs {
  const a = answer.toLowerCase();
  const next = { ...prefs };
  if (id === "origin") {
    const o = origins.find((x) => a.includes(x.city.toLowerCase()) || a.includes(x.code.toLowerCase()));
    next.origin = o?.city ?? origins[0].city;
  }
  if (id === "when") {
    next.when = answer;
    const n = a.match(/(\d+)\s*night/);
    if (n) next.nights = Math.min(14, Math.max(2, Number(n[1])));
    else if (a.includes("week") && !a.includes("weekend")) next.nights = 7;
    else if (a.includes("weekend")) next.nights = 3;
    else next.nights = dest.defaultNights;
  }
  if (id === "who") {
    next.travelerLabel = answer;
    const n = a.match(/(\d+)/);
    if (n) next.travelers = Number(n[1]);
    else if (a.includes("just me") || a.includes("solo") || a.includes("alone")) next.travelers = 1;
    else if (a.includes("family") || a.includes("kid")) next.travelers = 4;
    else if (a.includes("group") || a.includes("friends")) next.travelers = 4;
    else next.travelers = 2;
  }
  if (id === "budget") {
    const n = a.replace(/,/g, "").match(/(\d{3,6})/);
    if (n) next.budget = Number(n[1]);
    else if (a.includes("no hard")) next.budget = 12000;
  }
  if (id === "vibe") {
    next.vibes = answer.split(",").map((s) => s.trim()).filter(Boolean);
    const wants = (cat: string) => dest.activities.filter((x) => x.category.toLowerCase().includes(cat));
    const picks = [
      ...(a.includes("hike") ? wants("hike") : []),
      ...(a.includes("food") ? wants("food") : []),
      ...(a.includes("culture") ? wants("culture") : []),
      ...(a.includes("beach") ? wants("water") : []),
      ...dest.activities,
    ];
    next.activityIds = [...new Set(picks.map((p) => p.id))].slice(0, Math.min(3, next.nights - 1));
  }
  return next;
}

export function planSummary(plan: Plan, adjusted = false): string {
  const { dest, hotel, flight, underBy, prefs } = plan;
  const budgetLine =
    underBy >= 0
      ? `You’re ${underBy.toLocaleString()} under your line${adjusted ? ", I went with the cheaper picks to stay there" : ""}.`
      : `Honest answer: even the cheapest flight and stay come to ${Math.abs(underBy).toLocaleString()} over your line. I’ve picked those, and you could also shorten the trip or raise the budget.`;
  return `Here’s ${prefs.nights} nights in ${dest.name}. I picked ${flight.airline} (${flight.stops.toLowerCase()}), and ${hotel.name} in ${hotel.area} because it suits “${prefs.vibes[0]?.toLowerCase() ?? "your pace"}”. ${budgetLine}`;
}

export function suggestionsFor(plan: Plan, last: string): string[] {
  const s: string[] = [];
  if (last === "hotel-cheaper" || last === "flight-faster" || last === "flight-cheaper" || last === "rest") s.push("Undo that");
  const cheapestHotel = [...plan.dest.hotels].sort((a, b) => a.nightly - b.nightly)[0];
  const cheapestFlight = plan.dest.flights.find((f) => f.tag === "Cheapest");
  const fastestFlight = plan.dest.flights.find((f) => f.tag === "Fastest");
  if (last !== "hotel-cheaper" && plan.hotel.id !== cheapestHotel.id) s.push("Make the hotel cheaper");
  if (last === "hotel-cheaper") s.push("Show me all the stays");
  if (plan.underBy < 0 && cheapestFlight && plan.flight.id !== cheapestFlight.id) s.push("Find a cheaper flight");
  else if (fastestFlight && plan.flight.id !== fastestFlight.id && last !== "flight-faster") s.push("Find a faster flight");
  if (last !== "food") s.push(`Where should we eat in ${plan.dest.name}?`);
  if (last !== "rest") s.push("Add a rest day");
  return s.slice(0, 4);
}
