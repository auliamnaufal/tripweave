// Placeholder content for the UI pass. Prices and itineraries are illustrative samples,
// not live offers; the functional planner at /lab uses real searches.

export type Journey = {
  slug: string;
  place: string;
  country: string;
  image: string;
  mood: string;
  nights: number;
  from: number;
  blurb: string;
  highlights: string[];
};

export const journeys: Journey[] = [
  {
    slug: "kyoto",
    place: "Kyoto",
    country: "Japan",
    image: "/images/d-kyoto.webp",
    mood: "Slow & ceremonial",
    nights: 6,
    from: 2380,
    blurb: "Early torii walks before the crowds, a ryokan with a cedar bath, and a kaiseki dinner booked for the one rainy evening.",
    highlights: ["Fushimi Inari at 6 am", "Machiya stay in Higashiyama", "Tea in Uji"],
  },
  {
    slug: "lisbon",
    place: "Lisbon",
    country: "Portugal",
    image: "/images/d-lisbon.webp",
    mood: "Sunlit & unhurried",
    nights: 4,
    from: 1240,
    blurb: "Tram 28 at golden hour, a tiled guesthouse in Alfama, and a fado night picked to fit your budget instead of the guidebook.",
    highlights: ["Alfama guesthouse", "Day trip to Sintra", "Fado in Mouraria"],
  },
  {
    slug: "oahu",
    place: "Oahu",
    country: "Hawaii",
    image: "/images/d-oahu.webp",
    mood: "Salt & green",
    nights: 5,
    from: 2740,
    blurb: "Ridge hikes in the morning, reef snorkelling at noon, and a quiet North Shore stay far from the Waikiki towers.",
    highlights: ["Kualoa ridge trail", "Hanauma Bay snorkel", "North Shore cottage"],
  },
  {
    slug: "iceland",
    place: "Highlands",
    country: "Iceland",
    image: "/images/d-iceland.webp",
    mood: "Wild & quiet",
    nights: 7,
    from: 3120,
    blurb: "A ring-road loop with braided rivers, a black-sand beach at dawn, and a geothermal lagoon timed for the end of every long day.",
    highlights: ["Landmannalaugar day", "Glacier walk", "Hidden hot springs"],
  },
  {
    slug: "patagonia",
    place: "El Chaltén",
    country: "Argentina",
    image: "/images/d-patagonia.webp",
    mood: "Big & elemental",
    nights: 8,
    from: 3460,
    blurb: "Sunrise at Laguna de los Tres, a refugio with a wood stove, and buffer days the agent leaves open for Patagonian wind.",
    highlights: ["Fitz Roy sunrise", "Glacier Perito Moreno", "Estancia lunch"],
  },
  {
    slug: "amalfi",
    place: "Positano",
    country: "Italy",
    image: "/images/d-amalfi.webp",
    mood: "Golden & coastal",
    nights: 5,
    from: 2890,
    blurb: "A cliffside room with a terrace, a private boat to Capri, and lemon groves on the Path of the Gods.",
    highlights: ["Path of the Gods", "Boat day to Capri", "Ravello concert"],
  },
  {
    slug: "bali",
    place: "Ubud",
    country: "Indonesia",
    image: "/images/d-bali.webp",
    mood: "Lush & restorative",
    nights: 6,
    from: 1680,
    blurb: "Rice terraces at first light, a jungle villa with a plunge pool, and a cooking class with a family compound.",
    highlights: ["Tegallalang at dawn", "Villa in Sayan", "Balinese cooking class"],
  },
];

export type City = {
  name: string;
  native: string;
  nativeLabel: string;
  country: string;
  image: string;
  line: string;
  nights: number;
  from: number;
};

export const cities: City[] = [
  {
    name: "Kyoto",
    native: "京都",
    nativeLabel: "Kyōto",
    country: "Japan",
    image: "/images/w-kyoto.webp",
    line: "Lanterns, cedar baths, and a pagoda at the end of every street.",
    nights: 6,
    from: 2380,
  },
  {
    name: "Lisbon",
    native: "Lisboa",
    nativeLabel: "Lisboa",
    country: "Portugal",
    image: "/images/w-lisbon.webp",
    line: "Terracotta roofs, river light, and a yellow tram that never hurries.",
    nights: 4,
    from: 1240,
  },
  {
    name: "Oahu",
    native: "Oʻahu",
    nativeLabel: "Oʻahu",
    country: "Hawaii",
    image: "/images/w-oahu.webp",
    line: "Green ridges falling straight into a turquoise sea.",
    nights: 5,
    from: 2740,
  },
  {
    name: "Patagonia",
    native: "Patagonia",
    nativeLabel: "Patagonia",
    country: "Argentina",
    image: "/images/w-patagonia.webp",
    line: "Granite, glacier water, and wind that rearranges the plan.",
    nights: 8,
    from: 3460,
  },
];

export const steps = [
  {
    title: "Describe the trip you want",
    body: "Where from, where to, the dates, a hard budget, and how you like to travel. Plain words are enough: “slow mornings, good coffee, one big hike.”",
    image: "/images/h-tell.webp",
    meta: "Your brief",
  },
  {
    title: "The agent does the searching",
    body: "It compares real flight offers, stays and things to do, then assembles one plan. The maths is checked by code, not guessed by the model.",
    image: "/images/h-search.webp",
    meta: "Search & assemble",
  },
  {
    title: "Approve one payment",
    body: "One total, one PayPal approval. No stored card, no wallet left connected, nothing charged until you say yes.",
    image: "/images/h-pay.webp",
    meta: "Pay once",
  },
  {
    title: "Every booking, handled",
    body: "The agent books each supplier for you and shows its progress live. If one fails, that part is refunded automatically.",
    image: "/images/h-book.webp",
    meta: "Booked for you",
  },
];

export type WeaveItem =
  | {
      id: string;
      kind: "flight";
      title: string;
      price: number;
      airline: string;
      flight: string;
      from: string;
      fromCity: string;
      to: string;
      toCity: string;
      date: string;
      time: string;
      seat: string;
    }
  | { id: string; kind: "hotel"; title: string; price: number; image: string; nights: string; ref: string }
  | { id: string; kind: "activity"; title: string; price: number; date: string; serial: string; tone: "ember" | "sky" | "moss" };

export const weaveItems: WeaveItem[] = [
  { id: "f1", kind: "flight", title: "SFO → HNL", price: 612, airline: "Hawaiian Airlines", flight: "HA 11", from: "SFO", fromCity: "San Francisco", to: "HNL", toCity: "Honolulu", date: "12 MAR", time: "08:15", seat: "14A" },
  { id: "h1", kind: "hotel", title: "Haleʻiwa Garden Cottage", price: 980, image: "/images/h-book.webp", nights: "Mar 12 – 16 · 4 nights", ref: "HGC-2241" },
  { id: "a1", kind: "activity", title: "Hanauma Bay snorkel", price: 96, date: "Fri 13 Mar · 08:00", serial: "Nº 008831", tone: "sky" },
  { id: "a2", kind: "activity", title: "Kualoa ridge hike", price: 140, date: "Sat 14 Mar · 07:30", serial: "Nº 001407", tone: "moss" },
  { id: "a3", kind: "activity", title: "Sunset catamaran", price: 185, date: "Sun 15 Mar · 17:30", serial: "Nº 005521", tone: "ember" },
  { id: "f2", kind: "flight", title: "HNL → SFO", price: 588, airline: "Alaska Airlines", flight: "AS 878", from: "HNL", fromCity: "Honolulu", to: "SFO", toCity: "San Francisco", date: "17 MAR", time: "13:40", seat: "22C" },
];

export const WEAVE_BUDGET = 3000;

export const testimonials = [
  {
    quote: "I typed “Lisbon, four days, no early mornings, under $1,500” and got a plan I would have spent a week building. Paid once, done.",
    name: "Mara Okafor",
    trip: "Lisbon · 4 nights",
    avatar: "/images/a-1.webp",
    photo: "/images/w-lisbon.webp",
    place: "Miradouro, Lisbon",
  },
  {
    quote: "The budget line is the feature. Watching every option snap under it made me trust the rest of the plan.",
    name: "Daniel Reyes",
    trip: "Patagonia · 8 nights",
    avatar: "/images/a-2.webp",
    photo: "/images/w-patagonia.webp",
    place: "Laguna Torre, El Chaltén",
  },
  {
    quote: "It booked the ryokan, the train and the tea ceremony while I was still packing. The live booking list felt like magic.",
    name: "Yuna Park",
    trip: "Kyoto · 6 nights",
    avatar: "/images/a-3.webp",
    photo: "/images/d-kyoto.webp",
    place: "Fushimi Inari, Kyoto",
  },
];

export const faqs = [
  {
    q: "Is Tripweave a travel agency?",
    a: "No. Tripweave is the merchant for your one payment, and its agent books each supplier with that payment. Every booking keeps the supplier’s own terms.",
  },
  {
    q: "Where do the prices come from?",
    a: "Flight offers come from a live airline-content API at the moment you search. Totals, budget checks and schedule overlaps are computed by deterministic code, so the AI can choose offers but can never change a price.",
  },
  {
    q: "What happens if a booking fails?",
    a: "You see it immediately in the live booking list, and the amount for that item is refunded to your PayPal account. The rest of the trip stays booked.",
  },
  {
    q: "Do you keep my card or PayPal connected?",
    a: "No. You approve a single PayPal order for the exact total. There is no stored credential and no standing access after that approval.",
  },
  {
    q: "Can I change the plan before paying?",
    a: "Yes. Swap a hotel, drop an activity or tighten the budget in plain language and the agent re-plans around the change.",
  },
];

// Sample itinerary used across the app screens.
export const trip = {
  title: "Five slow days on Oahu",
  place: "Oahu, Hawaii",
  origin: "San Francisco",
  dates: "Mar 12 – Mar 17",
  travelers: 2,
  budget: 3000,
  hero: "/images/w-oahu.webp",
  flights: [
    {
      id: "f1",
      date: "Thu, Mar 12",
      depart: "08:15",
      arrive: "11:55",
      from: "SFO",
      to: "HNL",
      airline: "Hawaiian Airlines",
      code: "HA 11",
      duration: "5h 40m",
      stops: "Nonstop",
      price: 612,
    },
    {
      id: "f2",
      date: "Tue, Mar 17",
      depart: "13:40",
      arrive: "21:50",
      from: "HNL",
      to: "SFO",
      airline: "Alaska Airlines",
      code: "AS 878",
      duration: "5h 10m",
      stops: "Nonstop",
      price: 588,
    },
  ],
  hotel: {
    name: "Haleʻiwa Garden Cottage",
    area: "North Shore",
    nights: 4,
    rating: 4.8,
    reviews: 212,
    image: "/images/h-book.webp",
    price: 980,
    perks: ["Ocean-view lanai", "Free cancellation until Mar 5", "Bikes included"],
  },
  days: [
    {
      day: 1,
      date: "Thu, Mar 12",
      title: "Land, salt air, slow dinner",
      items: [
        { time: "11:55", kind: "flight", title: "Arrive HNL", note: "HA 11 from SFO" },
        { time: "14:00", kind: "hotel", title: "Check in at Haleʻiwa Garden Cottage", note: "North Shore" },
        { time: "18:30", kind: "food", title: "Poke and sunset at Haleʻiwa Beach Park", note: "Free" },
      ],
    },
    {
      day: 2,
      date: "Fri, Mar 13",
      title: "Reef morning",
      items: [
        { time: "08:00", kind: "activity", title: "Hanauma Bay snorkel", note: "$96 · gear included" },
        { time: "13:00", kind: "food", title: "Shrimp truck lunch, Kahuku", note: "Local pick" },
        { time: "16:00", kind: "free", title: "Nap, then the beach", note: "Left open on purpose" },
      ],
    },
    {
      day: 3,
      date: "Sat, Mar 14",
      title: "Up the green ridge",
      items: [
        { time: "07:30", kind: "activity", title: "Guided Kualoa ridge hike", note: "$140 · 4 hrs" },
        { time: "15:00", kind: "food", title: "Shave ice at Matsumoto", note: "Haleʻiwa" },
      ],
    },
    {
      day: 4,
      date: "Sun, Mar 15",
      title: "Out on the water",
      items: [
        { time: "10:00", kind: "free", title: "Farmers market, Kakaʻako", note: "Morning wander" },
        { time: "17:30", kind: "activity", title: "Sunset catamaran from Waikiki", note: "$185 · 2 hrs" },
      ],
    },
    {
      day: 5,
      date: "Mon, Mar 16",
      title: "Nowhere to be",
      items: [
        { time: "09:00", kind: "free", title: "Turtle beach, Laniākea", note: "Keep your distance" },
        { time: "19:00", kind: "food", title: "Farewell dinner, Haleʻiwa Joe’s", note: "Reserved for 2" },
      ],
    },
    {
      day: 6,
      date: "Tue, Mar 17",
      title: "Fly home",
      items: [{ time: "13:40", kind: "flight", title: "Depart HNL", note: "AS 878 to SFO" }],
    },
  ],
  activities: [
    { id: "a1", title: "Hanauma Bay snorkel", image: "/images/m-kayak.webp", price: 96, rating: 4.7, tag: "Nature" },
    { id: "a2", title: "Kualoa ridge hike", image: "/images/d-oahu.webp", price: 140, rating: 4.9, tag: "Hike" },
    { id: "a3", title: "Sunset catamaran", image: "/images/w-oahu.webp", price: 185, rating: 4.6, tag: "Water" },
  ],
};

export function tripTotal(): number {
  return (
    trip.flights.reduce((sum, f) => sum + f.price, 0) +
    trip.hotel.price +
    trip.activities.reduce((sum, a) => sum + a.price, 0)
  );
}

export const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
