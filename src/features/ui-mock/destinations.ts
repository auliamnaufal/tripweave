// Rich placeholder data for the planner UI. Shapes mirror what the real search tools
// will return, so the screens can be wired to the agent later without redesign.

export type FlightOption = {
  id: string;
  airline: string;
  code: string;
  depart: string;
  arrive: string;
  duration: string;
  stops: string;
  returnDepart: string;
  returnArrive: string;
  pricePerPerson: number;
  tag: "Best" | "Cheapest" | "Fastest";
};

export type HotelOption = {
  id: string;
  name: string;
  area: string;
  nightly: number;
  rating: number;
  reviews: number;
  image: string;
  perks: string[];
  tag: string;
};

export type Activity = {
  id: string;
  title: string;
  duration: string;
  pricePerPerson: number;
  rating: number;
  image: string;
  category: string;
  slot: string;
};

export type FoodSpot = { name: string; dish: string; area: string; price: "$" | "$$" | "$$$"; note: string; image?: string };

export type Destination = {
  id: string;
  name: string;
  country: string;
  airport: string;
  card: string;
  hero: string;
  tagline: string;
  blurb: string;
  bestTime: string;
  weather: string;
  currency: string;
  timezone: string;
  defaultNights: number;
  keywords: string[];
  flights: FlightOption[];
  hotels: HotelOption[];
  activities: Activity[];
  food: FoodSpot[];
  tips: string[];
};

const img = (name: string) => `/images/dest/${name}.webp`;

export const destinations: Destination[] = [
  {
    id: "oahu",
    name: "Oahu",
    country: "Hawaii, USA",
    airport: "HNL",
    card: "/images/d-oahu.webp",
    hero: "/images/w-oahu.webp",
    tagline: "Salt, green ridges and slow North Shore mornings",
    blurb: "Oahu is the most lived-in Hawaiian island: Honolulu’s food scene on one side, empty North Shore beaches and the Koʻolau ridges on the other.",
    bestTime: "April–June and Sept–Oct: dry, warm, fewer crowds",
    weather: "27°C, light trade winds",
    currency: "USD",
    timezone: "HST (UTC−10)",
    defaultNights: 5,
    keywords: ["oahu", "hawaii", "honolulu", "waikiki", "north shore"],
    flights: [
      { id: "oahu-f1", airline: "Hawaiian Airlines", code: "HA 11", depart: "08:15", arrive: "11:55", duration: "5h 40m", stops: "Nonstop", returnDepart: "13:40", returnArrive: "21:50", pricePerPerson: 306, tag: "Best" },
      { id: "oahu-f2", airline: "Southwest", code: "WN 1724", depart: "06:05", arrive: "09:55", duration: "5h 50m", stops: "Nonstop", returnDepart: "22:30", returnArrive: "06:15", pricePerPerson: 238, tag: "Cheapest" },
      { id: "oahu-f3", airline: "United", code: "UA 1158", depart: "10:30", arrive: "13:55", duration: "5h 25m", stops: "Nonstop", returnDepart: "15:10", returnArrive: "23:05", pricePerPerson: 349, tag: "Fastest" },
    ],
    hotels: [
      { id: "oahu-h1", name: "Haleʻiwa Garden Cottage", area: "North Shore", nightly: 245, rating: 4.8, reviews: 212, image: img("oahu-hotel"), perks: ["Ocean-view lanai", "Bikes included", "Free cancellation until 7 days before"], tag: "Quiet pick" },
      { id: "oahu-h2", name: "Kailua Beach Studio", area: "Kailua", nightly: 189, rating: 4.6, reviews: 148, image: img("oahu-hotel2"), perks: ["5 min walk to Kailua Beach", "Kitchenette", "Kayak rental nearby"], tag: "Best value" },
      { id: "oahu-h3", name: "The Surfjack", area: "Waikiki", nightly: 312, rating: 4.5, reviews: 1834, image: img("oahu-hotel3"), perks: ["Pool and bar", "Walk to everything", "Breakfast included"], tag: "Lively" },
    ],
    activities: [
      { id: "oahu-a1", title: "Hanauma Bay snorkel", duration: "3 hrs", pricePerPerson: 48, rating: 4.7, image: img("oahu-act1"), category: "Water", slot: "08:00" },
      { id: "oahu-a2", title: "Kualoa ridge hike", duration: "4 hrs", pricePerPerson: 70, rating: 4.9, image: "/images/d-oahu.webp", category: "Hike", slot: "07:30" },
      { id: "oahu-a3", title: "Sunset catamaran", duration: "2 hrs", pricePerPerson: 92, rating: 4.6, image: img("oahu-act2"), category: "Water", slot: "17:30" },
      { id: "oahu-a4", title: "Lanikai Pillbox trail", duration: "1.5 hrs", pricePerPerson: 0, rating: 4.8, image: "/images/w-oahu.webp", category: "Hike", slot: "06:30" },
    ],
    food: [
      { name: "Ono Seafood", dish: "Shoyu ahi poke", area: "Kapahulu", price: "$", note: "Go before noon, it sells out", image: img("oahu-food") },
      { name: "Giovanni’s", dish: "Garlic shrimp plate", area: "Kahuku", price: "$", note: "The original white truck" },
      { name: "Haleʻiwa Joe’s", dish: "Fresh catch, coconut shrimp", area: "Haleʻiwa", price: "$$", note: "Ask for a harbour table" },
    ],
    tips: ["Hanauma Bay needs a timed reservation, released 2 days ahead.", "Rent a car for the North Shore; buses take 2+ hours.", "Reef-safe sunscreen only, it’s the law."],
  },
  {
    id: "kyoto",
    name: "Kyoto",
    country: "Japan",
    airport: "KIX",
    card: "/images/d-kyoto.webp",
    hero: "/images/w-kyoto.webp",
    tagline: "Early temples, cedar baths and a kaiseki for the rainy night",
    blurb: "Kyoto rewards early risers: the shrines are empty before 7am, and the evenings belong to tiny counters in Gion and Pontocho.",
    bestTime: "Late March–April and November",
    weather: "16°C, light drizzle possible",
    currency: "JPY",
    timezone: "JST (UTC+9)",
    defaultNights: 6,
    keywords: ["kyoto", "japan", "osaka", "tokyo", "nara"],
    flights: [
      { id: "kyoto-f1", airline: "Japan Airlines", code: "JL 59", depart: "12:50", arrive: "16:55+1", duration: "11h 05m", stops: "Nonstop to KIX", returnDepart: "17:20", returnArrive: "10:45", pricePerPerson: 1180, tag: "Best" },
      { id: "kyoto-f2", airline: "Zipair", code: "ZG 25", depart: "16:40", arrive: "20:10+1", duration: "11h 30m", stops: "Nonstop to NRT", returnDepart: "19:00", returnArrive: "11:50", pricePerPerson: 640, tag: "Cheapest" },
      { id: "kyoto-f3", airline: "ANA", code: "NH 7", depart: "11:00", arrive: "14:40+1", duration: "10h 40m", stops: "Nonstop to KIX", returnDepart: "16:55", returnArrive: "09:55", pricePerPerson: 1310, tag: "Fastest" },
    ],
    hotels: [
      { id: "kyoto-h1", name: "Ryokan Yachiyo", area: "Nanzenji", nightly: 290, rating: 4.8, reviews: 534, image: img("kyoto-hotel"), perks: ["Cedar bath", "Kaiseki breakfast", "Garden-view room"], tag: "Traditional" },
      { id: "kyoto-h2", name: "Machiya House Sanjo", area: "Nakagyo", nightly: 165, rating: 4.7, reviews: 302, image: img("kyoto-hotel2"), perks: ["Whole townhouse", "Walk to Nishiki Market", "Washing machine"], tag: "Best value" },
      { id: "kyoto-h3", name: "Hotel The Celestine", area: "Gion", nightly: 340, rating: 4.6, reviews: 1290, image: img("kyoto-hotel3"), perks: ["Onsen on site", "Gion at the door", "Late check-out"], tag: "Central" },
    ],
    activities: [
      { id: "kyoto-a1", title: "Fushimi Inari at dawn", duration: "2.5 hrs", pricePerPerson: 0, rating: 4.9, image: "/images/d-kyoto.webp", category: "Culture", slot: "06:00" },
      { id: "kyoto-a2", title: "Tea ceremony in Uji", duration: "1.5 hrs", pricePerPerson: 45, rating: 4.8, image: img("kyoto-act1"), category: "Culture", slot: "10:30" },
      { id: "kyoto-a3", title: "Arashiyama bamboo walk", duration: "3 hrs", pricePerPerson: 0, rating: 4.6, image: img("kyoto-act2"), category: "Walk", slot: "07:00" },
      { id: "kyoto-a4", title: "Gion food tour", duration: "3 hrs", pricePerPerson: 120, rating: 4.9, image: img("kyoto-food"), category: "Food", slot: "18:00" },
    ],
    food: [
      { name: "Menya Inoichi", dish: "Dashi ramen", area: "Shijo", price: "$", note: "Queue opens 30 min before", image: img("kyoto-food") },
      { name: "Nishiki Market", dish: "Tamagoyaki and tako", area: "Nakagyo", price: "$", note: "Graze, don’t sit" },
      { name: "Gion Karyo", dish: "Seasonal kaiseki", area: "Gion", price: "$$$", note: "Booked for your rainy evening" },
    ],
    tips: ["Get a ICOCA card at the airport for trains and buses.", "Most temples open 8–9am; Fushimi Inari is open all night.", "Cash still rules in small restaurants."],
  },
  {
    id: "lisbon",
    name: "Lisbon",
    country: "Portugal",
    airport: "LIS",
    card: "/images/d-lisbon.webp",
    hero: "/images/w-lisbon.webp",
    tagline: "Tiled guesthouses, river light and no early mornings",
    blurb: "Lisbon is a city of hills and viewpoints. Late breakfasts, long lunches, and the best light of the day at the miradouros around 7pm.",
    bestTime: "April–June and September–October",
    weather: "22°C, sunny",
    currency: "EUR",
    timezone: "WET (UTC+0)",
    defaultNights: 4,
    keywords: ["lisbon", "lisboa", "portugal", "porto", "sintra"],
    flights: [
      { id: "lisbon-f1", airline: "TAP Air Portugal", code: "TP 238", depart: "18:30", arrive: "14:05+1", duration: "11h 35m", stops: "1 stop · Newark", returnDepart: "10:20", returnArrive: "17:45", pricePerPerson: 720, tag: "Best" },
      { id: "lisbon-f2", airline: "United", code: "UA 64", depart: "21:45", arrive: "19:10+1", duration: "13h 25m", stops: "1 stop · Newark", returnDepart: "08:55", returnArrive: "17:30", pricePerPerson: 590, tag: "Cheapest" },
      { id: "lisbon-f3", airline: "TAP Air Portugal", code: "TP 236", depart: "15:10", arrive: "10:35+1", duration: "10h 25m", stops: "Nonstop", returnDepart: "11:30", returnArrive: "15:20", pricePerPerson: 860, tag: "Fastest" },
    ],
    hotels: [
      { id: "lisbon-h1", name: "Casa Azulejo Alfama", area: "Alfama", nightly: 138, rating: 4.8, reviews: 421, image: img("lisbon-hotel"), perks: ["River-view window", "Breakfast with pastéis", "Free cancellation"], tag: "Charming" },
      { id: "lisbon-h2", name: "Lisboa Hostel Rooms", area: "Baixa", nightly: 92, rating: 4.5, reviews: 2104, image: img("lisbon-hotel2"), perks: ["Private double", "Metro at the door", "Rooftop terrace"], tag: "Best value" },
      { id: "lisbon-h3", name: "Memmo Príncipe Real", area: "Príncipe Real", nightly: 265, rating: 4.7, reviews: 980, image: img("lisbon-hotel3"), perks: ["Pool with city view", "Quiet street", "Late check-out"], tag: "Treat" },
    ],
    activities: [
      { id: "lisbon-a1", title: "Day trip to Sintra", duration: "Full day", pricePerPerson: 65, rating: 4.7, image: img("lisbon-act1"), category: "Day trip", slot: "09:30" },
      { id: "lisbon-a2", title: "Fado night in Mouraria", duration: "2.5 hrs", pricePerPerson: 55, rating: 4.8, image: img("lisbon-act2"), category: "Music", slot: "21:00" },
      { id: "lisbon-a3", title: "Tram 28 and viewpoints", duration: "3 hrs", pricePerPerson: 6, rating: 4.4, image: "/images/d-lisbon.webp", category: "Walk", slot: "17:00" },
      { id: "lisbon-a4", title: "Petiscos food walk", duration: "3 hrs", pricePerPerson: 85, rating: 4.9, image: img("lisbon-food"), category: "Food", slot: "13:00" },
    ],
    food: [
      { name: "Manteigaria", dish: "Pastel de nata, warm", area: "Chiado", price: "$", note: "Watch them come out of the oven", image: img("lisbon-food") },
      { name: "Taberna da Rua das Flores", dish: "Petiscos, daily board", area: "Chiado", price: "$$", note: "No bookings, go at 7pm" },
      { name: "Cervejaria Ramiro", dish: "Garlic prawns, prego roll", area: "Intendente", price: "$$", note: "Finish with the steak sandwich" },
    ],
    tips: ["Wear grippy shoes, the cobbles are polished.", "Lisboa Card covers trams, trains to Sintra and museums.", "Dinner starts at 8pm; lunch is the bigger meal."],
  },
  {
    id: "patagonia",
    name: "El Chaltén",
    country: "Patagonia, Argentina",
    airport: "FTE",
    card: "/images/d-patagonia.webp",
    hero: "/images/w-patagonia.webp",
    tagline: "Granite spires, glacier water and buffer days for the wind",
    blurb: "El Chaltén is Argentina’s trekking capital. Trails start at the edge of town, and the weather decides your day, so good plans leave room.",
    bestTime: "November–March (southern summer)",
    weather: "14°C, windy, changeable",
    currency: "ARS",
    timezone: "ART (UTC−3)",
    defaultNights: 8,
    keywords: ["patagonia", "chalten", "chaltén", "calafate", "argentina", "fitz roy", "torres", "chile"],
    flights: [
      { id: "pat-f1", airline: "LATAM + Aerolíneas", code: "LA 8051", depart: "22:10", arrive: "16:40+1", duration: "20h 30m", stops: "2 stops · Lima, Buenos Aires", returnDepart: "11:30", returnArrive: "06:55+1", pricePerPerson: 1240, tag: "Best" },
      { id: "pat-f2", airline: "Copa + Aerolíneas", code: "CM 285", depart: "06:40", arrive: "13:15+1", duration: "26h 35m", stops: "2 stops · Panama, Buenos Aires", returnDepart: "14:00", returnArrive: "12:40+1", pricePerPerson: 980, tag: "Cheapest" },
      { id: "pat-f3", airline: "American + Aerolíneas", code: "AA 931", depart: "20:00", arrive: "13:30+1", duration: "19h 30m", stops: "2 stops · Miami, Buenos Aires", returnDepart: "10:15", returnArrive: "04:50+1", pricePerPerson: 1420, tag: "Fastest" },
    ],
    hotels: [
      { id: "pat-h1", name: "Refugio Los Cerros", area: "El Chaltén", nightly: 185, rating: 4.7, reviews: 388, image: img("patagonia-hotel"), perks: ["Wood stove lounge", "Packed trail lunches", "Drying room"], tag: "Trekker’s base" },
      { id: "pat-h2", name: "Hostería Senderos", area: "El Chaltén", nightly: 120, rating: 4.6, reviews: 612, image: img("patagonia-hotel2"), perks: ["Big breakfast", "Gear storage", "Trailhead 5 min"], tag: "Best value" },
      { id: "pat-h3", name: "Estancia La Quinta", area: "Outside town", nightly: 260, rating: 4.8, reviews: 214, image: img("patagonia-hotel3"), perks: ["Asado dinners", "Horse riding", "Mountain views"], tag: "Remote" },
    ],
    activities: [
      { id: "pat-a1", title: "Laguna de los Tres at sunrise", duration: "10 hrs", pricePerPerson: 0, rating: 4.9, image: "/images/d-patagonia.webp", category: "Hike", slot: "03:30" },
      { id: "pat-a2", title: "Perito Moreno glacier day", duration: "Full day", pricePerPerson: 140, rating: 4.9, image: img("patagonia-act1"), category: "Day trip", slot: "07:00" },
      { id: "pat-a3", title: "Estancia asado lunch", duration: "4 hrs", pricePerPerson: 75, rating: 4.7, image: img("patagonia-act2"), category: "Food", slot: "12:00" },
      { id: "pat-a4", title: "Laguna Torre trek", duration: "7 hrs", pricePerPerson: 0, rating: 4.8, image: "/images/w-patagonia.webp", category: "Hike", slot: "07:30" },
    ],
    food: [
      { name: "La Cervecería", dish: "Locro and house stout", area: "El Chaltén", price: "$$", note: "Post-hike ritual", image: img("patagonia-food") },
      { name: "Patagonicus", dish: "Wood-fired pizza", area: "El Chaltén", price: "$", note: "Order at the counter" },
      { name: "Estancia La Quinta", dish: "Lamb al asador", area: "Ruta 23", price: "$$$", note: "Lunch only" },
    ],
    tips: ["Bring cash in pesos; ATMs in town often run dry.", "Keep two buffer days for wind and rain.", "The bus from El Calafate takes 3 hours."],
  },
  {
    id: "bali",
    name: "Ubud",
    country: "Bali, Indonesia",
    airport: "DPS",
    card: "/images/d-bali.webp",
    hero: "/images/d-bali.webp",
    tagline: "Rice terraces at first light and a villa with a plunge pool",
    blurb: "Ubud is Bali’s green heart: jungle valleys, temple ceremonies, and a food scene that goes from 2-dollar warungs to tasting menus.",
    bestTime: "April–October (dry season)",
    weather: "29°C, humid, afternoon showers",
    currency: "IDR",
    timezone: "WITA (UTC+8)",
    defaultNights: 6,
    keywords: ["bali", "ubud", "denpasar", "canggu", "seminyak"],
    flights: [
      { id: "bali-f1", airline: "Singapore Airlines", code: "SQ 31", depart: "23:55", arrive: "11:10+2", duration: "20h 15m", stops: "1 stop · Singapore", returnDepart: "16:25", returnArrive: "22:30", pricePerPerson: 1090, tag: "Best" },
      { id: "bali-f2", airline: "Korean Air", code: "KE 24", depart: "11:40", arrive: "00:35+2", duration: "21h 55m", stops: "1 stop · Seoul", returnDepart: "01:10", returnArrive: "18:40", pricePerPerson: 860, tag: "Cheapest" },
      { id: "bali-f3", airline: "EVA Air", code: "BR 27", depart: "00:40", arrive: "11:25+1", duration: "19h 45m", stops: "1 stop · Taipei", returnDepart: "13:05", returnArrive: "21:55", pricePerPerson: 1150, tag: "Fastest" },
    ],
    hotels: [
      { id: "bali-h1", name: "Villa Sungai Sayan", area: "Sayan", nightly: 210, rating: 4.9, reviews: 267, image: img("bali-hotel"), perks: ["Private plunge pool", "Floating breakfast", "Valley view"], tag: "Splurge-ish" },
      { id: "bali-h2", name: "Ubud Garden Bungalows", area: "Penestanan", nightly: 75, rating: 4.7, reviews: 943, image: img("bali-hotel2"), perks: ["Rice-field view", "Shared pool", "Scooter rental"], tag: "Best value" },
      { id: "bali-h3", name: "Kayon Jungle Retreat", area: "Kelusa", nightly: 320, rating: 4.8, reviews: 1820, image: img("bali-hotel3"), perks: ["Infinity pool", "Spa", "Daily yoga"], tag: "Retreat" },
    ],
    activities: [
      { id: "bali-a1", title: "Tegallalang terraces at dawn", duration: "2 hrs", pricePerPerson: 3, rating: 4.5, image: "/images/d-bali.webp", category: "Nature", slot: "06:30" },
      { id: "bali-a2", title: "Balinese cooking class", duration: "5 hrs", pricePerPerson: 38, rating: 4.9, image: img("bali-act1"), category: "Food", slot: "08:00" },
      { id: "bali-a3", title: "Mount Batur sunrise trek", duration: "8 hrs", pricePerPerson: 55, rating: 4.7, image: img("bali-act2"), category: "Hike", slot: "02:00" },
      { id: "bali-a4", title: "Campuhan ridge walk", duration: "1.5 hrs", pricePerPerson: 0, rating: 4.6, image: img("bali-act4"), category: "Walk", slot: "16:30" },
    ],
    food: [
      { name: "Warung Biah Biah", dish: "Small-plate nasi campur", area: "Ubud centre", price: "$", note: "Order five plates and share", image: img("bali-food") },
      { name: "Ibu Oka", dish: "Babi guling", area: "Ubud Palace", price: "$", note: "Lunch only, goes fast" },
      { name: "Locavore NXT", dish: "Tasting menu", area: "Ubud", price: "$$$", note: "Booked 3 weeks ahead" },
    ],
    tips: ["Grab or Gojek apps are cheaper than taxis.", "Carry a sarong for temple visits.", "Rainy season afternoons are short; plan mornings outdoors."],
  },
  {
    id: "amalfi",
    name: "Positano",
    country: "Amalfi Coast, Italy",
    airport: "NAP",
    card: "/images/d-amalfi.webp",
    hero: "/images/d-amalfi.webp",
    tagline: "Cliffside terraces, a boat to Capri and lemon groves on foot",
    blurb: "The Amalfi Coast is steep, crowded at noon and magic at 7am. Base in Positano, move by boat, and walk the Path of the Gods before the heat.",
    bestTime: "May–June and September",
    weather: "26°C, sunny",
    currency: "EUR",
    timezone: "CET (UTC+1)",
    defaultNights: 5,
    keywords: ["amalfi", "positano", "italy", "capri", "naples", "sorrento", "ravello"],
    flights: [
      { id: "amalfi-f1", airline: "ITA Airways", code: "AZ 609", depart: "17:20", arrive: "15:55+1", duration: "13h 35m", stops: "1 stop · Rome", returnDepart: "09:40", returnArrive: "19:05", pricePerPerson: 940, tag: "Best" },
      { id: "amalfi-f2", airline: "Lufthansa", code: "LH 455", depart: "15:30", arrive: "17:10+1", duration: "16h 40m", stops: "1 stop · Munich", returnDepart: "06:55", returnArrive: "17:40", pricePerPerson: 780, tag: "Cheapest" },
      { id: "amalfi-f3", airline: "United", code: "UA 958", depart: "16:00", arrive: "12:20+1", duration: "11h 20m", stops: "Nonstop to FCO + train", returnDepart: "11:15", returnArrive: "15:10", pricePerPerson: 1080, tag: "Fastest" },
    ],
    hotels: [
      { id: "amalfi-h1", name: "Casa Limoncello", area: "Positano", nightly: 330, rating: 4.8, reviews: 412, image: img("amalfi-hotel"), perks: ["Sea-view terrace", "Breakfast on the roof", "Port transfer"], tag: "View" },
      { id: "amalfi-h2", name: "Pensione Maria Luisa", area: "Positano", nightly: 175, rating: 4.7, reviews: 830, image: img("amalfi-hotel2"), perks: ["Family-run", "Balcony room", "Near Fornillo beach"], tag: "Best value" },
      { id: "amalfi-h3", name: "Hotel Villa Cimbrone", area: "Ravello", nightly: 520, rating: 4.9, reviews: 690, image: img("amalfi-hotel3"), perks: ["Historic gardens", "Infinity terrace", "Pool"], tag: "Once in a lifetime" },
    ],
    activities: [
      { id: "amalfi-a1", title: "Path of the Gods hike", duration: "4 hrs", pricePerPerson: 0, rating: 4.9, image: img("amalfi-act1"), category: "Hike", slot: "07:30" },
      { id: "amalfi-a2", title: "Private boat to Capri", duration: "Full day", pricePerPerson: 160, rating: 4.8, image: img("amalfi-act2"), category: "Water", slot: "09:30" },
      { id: "amalfi-a3", title: "Ravello gardens and concert", duration: "4 hrs", pricePerPerson: 45, rating: 4.6, image: img("amalfi-act3"), category: "Culture", slot: "16:00" },
      { id: "amalfi-a4", title: "Lemon farm lunch", duration: "3 hrs", pricePerPerson: 70, rating: 4.8, image: img("amalfi-food"), category: "Food", slot: "12:30" },
    ],
    food: [
      { name: "Da Adolfo", dish: "Spaghetti alle vongole", area: "Laurito beach", price: "$$", note: "Red-fish boat from the pier", image: img("amalfi-food") },
      { name: "Collina Positano", dish: "Lemon granita", area: "Positano", price: "$", note: "Afternoon stop" },
      { name: "La Sponda", dish: "Candlelit dinner", area: "Le Sirenuse", price: "$$$", note: "One night only, worth it" },
    ],
    tips: ["Ferries beat the coastal bus in summer.", "Beach clubs need a morning booking in July–August.", "Pack light; Positano is all stairs."],
  },
  {
    id: "iceland",
    name: "South Iceland",
    country: "Iceland",
    airport: "KEF",
    card: "/images/d-iceland.webp",
    hero: "/images/c-valley.webp",
    tagline: "Braided rivers, glacier walks and a hot spring every evening",
    blurb: "A road trip along the south coast: waterfalls every twenty minutes, black-sand beaches, and guesthouses that turn off the lights for the aurora.",
    bestTime: "June–August for hiking, Sept–March for aurora",
    weather: "11°C, wind and showers",
    currency: "ISK",
    timezone: "GMT (UTC+0)",
    defaultNights: 7,
    keywords: ["iceland", "reykjavik", "reykjavík", "aurora", "glacier"],
    flights: [
      { id: "ice-f1", airline: "Icelandair", code: "FI 680", depart: "18:30", arrive: "08:40+1", duration: "8h 10m", stops: "Nonstop", returnDepart: "16:45", returnArrive: "18:55", pricePerPerson: 690, tag: "Best" },
      { id: "ice-f2", airline: "PLAY", code: "OG 202", depart: "21:00", arrive: "13:15+1", duration: "11h 15m", stops: "1 stop · Baltimore", returnDepart: "14:10", returnArrive: "20:30", pricePerPerson: 450, tag: "Cheapest" },
      { id: "ice-f3", airline: "Icelandair", code: "FI 670", depart: "16:05", arrive: "06:00+1", duration: "7h 55m", stops: "Nonstop", returnDepart: "17:00", returnArrive: "19:05", pricePerPerson: 760, tag: "Fastest" },
    ],
    hotels: [
      { id: "ice-h1", name: "Hrífunes Guesthouse", area: "Vík region", nightly: 220, rating: 4.8, reviews: 512, image: img("iceland-hotel"), perks: ["Aurora wake-up call", "Hot tub", "Home-cooked dinner"], tag: "Cosy" },
      { id: "ice-h2", name: "Skógar Farm Rooms", area: "Skógar", nightly: 150, rating: 4.5, reviews: 380, image: img("iceland-hotel2"), perks: ["Walk to Skógafoss", "Shared kitchen", "Free parking"], tag: "Best value" },
      { id: "ice-h3", name: "Hotel Rangá", area: "Hella", nightly: 380, rating: 4.7, reviews: 1460, image: img("iceland-hotel3"), perks: ["Observatory", "Outdoor hot tubs", "Fine dining"], tag: "Aurora hunter" },
    ],
    activities: [
      { id: "ice-a1", title: "Sólheimajökull glacier walk", duration: "3 hrs", pricePerPerson: 115, rating: 4.8, image: img("iceland-act1"), category: "Adventure", slot: "10:00" },
      { id: "ice-a2", title: "Reykjadalur hot river", duration: "3 hrs", pricePerPerson: 0, rating: 4.7, image: img("iceland-act2"), category: "Hike", slot: "15:00" },
      { id: "ice-a3", title: "Landmannalaugar day", duration: "Full day", pricePerPerson: 160, rating: 4.9, image: "/images/d-iceland.webp", category: "Day trip", slot: "07:30" },
      { id: "ice-a4", title: "Reynisfjara black beach", duration: "1.5 hrs", pricePerPerson: 0, rating: 4.6, image: img("iceland-act4"), category: "Nature", slot: "18:00" },
    ],
    food: [
      { name: "Súpa Café", dish: "Lamb soup refills", area: "Vík", price: "$", note: "Bread is free", image: img("iceland-food") },
      { name: "Friðheimar", dish: "Tomato soup in a greenhouse", area: "Reykholt", price: "$$", note: "Book a noon table" },
      { name: "Matur og Drykkur", dish: "Modern Icelandic tasting", area: "Reykjavík", price: "$$$", note: "Last night splurge" },
    ],
    tips: ["Check road.is and vedur.is every morning.", "Fuel up whenever you can outside the ring road towns.", "Never turn your back on the waves at Reynisfjara."],
  },
];

export const origins = [
  { city: "San Francisco", code: "SFO", factor: 1 },
  { city: "New York", code: "JFK", factor: 1.08 },
  { city: "London", code: "LHR", factor: 0.92 },
  { city: "Singapore", code: "SIN", factor: 0.85 },
  { city: "Jakarta", code: "CGK", factor: 0.8 },
];

export function findDestination(text: string): Destination | undefined {
  const t = text.toLowerCase();
  return destinations.find((d) => d.keywords.some((k) => t.includes(k)) || t.includes(d.name.toLowerCase()));
}

export function getDestination(id: string | null | undefined): Destination {
  return destinations.find((d) => d.id === id) ?? (id ? customDestinations.get(id) : undefined) ?? destinations[0];
}

/** What the UI needs to show a place outside the catalog (from the intake agent's reading of a request). */
export type CustomPlace = { id: string; name: string; country: string; airport: string; route: string[] };

const customDestinations = new Map<string, Destination>();

/**
 * Registers a trip to anywhere: the screens get a Destination named after the
 * real route ("Tokyo · Osaka"). Its sample flights, stays and food come from
 * the closest catalog place (same country if there is one) and only fill
 * placeholders; the live plan supplies everything that's bought.
 */
export function registerCustomDestination(place: CustomPlace): Destination {
  const existing = customDestinations.get(place.id);
  if (existing) return existing;
  const template = findDestination(place.country) ?? findDestination(place.route.join(" ")) ?? destinations[0];
  const sameCountry = template.country.toLowerCase().includes(place.country.toLowerCase()) || place.country.toLowerCase().includes(template.country.toLowerCase());
  const destination: Destination = {
    ...template,
    id: place.id,
    name: place.name,
    country: place.country,
    airport: place.airport || template.airport,
    hero: sameCountry ? template.hero : "/images/hero-mist.webp",
    card: sameCountry ? template.card : "/images/c-valley.webp",
    tagline: place.route.join(" → "),
    blurb: `${place.route.join(", then ")}, planned from what you asked for.`,
    keywords: [],
    tips: sameCountry ? template.tips : [],
  };
  customDestinations.set(place.id, destination);
  return destination;
}

export function isCustomDestination(id: string | null | undefined): boolean {
  return Boolean(id && customDestinations.has(id));
}

export type TripPrefs = {
  destId: string;
  origin: string;
  nights: number;
  travelers: number;
  travelerLabel: string;
  budget: number;
  vibes: string[];
  when: string;
  flightIdx: number;
  hotelIdx: number;
  activityIds: string[];
  restDays: number;
};

export function defaultPrefs(destId = "oahu"): TripPrefs {
  const d = getDestination(destId);
  const base: TripPrefs = {
    destId: d.id,
    origin: "San Francisco",
    nights: d.defaultNights,
    travelers: 2,
    travelerLabel: "Two of us",
    budget: 3000,
    vibes: ["Slow mornings"],
    when: "Next month",
    flightIdx: 0,
    hotelIdx: 0,
    activityIds: d.activities.slice(0, 3).map((a) => a.id),
    restDays: 0,
  };
  // A sensible default ceiling for this destination: the recommended plan plus ~10% headroom.
  const typical = buildPlan(base).totals.total;
  return { ...base, budget: Math.ceil((typical * 1.1) / 500) * 500 };
}

export type DayItem = { time: string; kind: "flight" | "hotel" | "activity" | "food" | "free"; title: string; note: string };
export type PlanDay = { day: number; title: string; items: DayItem[] };

export type Plan = {
  dest: Destination;
  prefs: TripPrefs;
  originCode: string;
  flight: FlightOption & { price: number };
  hotel: HotelOption & { price: number };
  activities: (Activity & { price: number })[];
  days: PlanDay[];
  totals: { flights: number; hotel: number; activities: number; total: number };
  underBy: number;
};

export function flightTotal(f: FlightOption, prefs: TripPrefs): number {
  const origin = origins.find((o) => o.city === prefs.origin) ?? origins[0];
  return Math.round(f.pricePerPerson * origin.factor) * 2 * prefs.travelers;
}

export function buildPlan(prefs: TripPrefs): Plan {
  const dest = getDestination(prefs.destId);
  const origin = origins.find((o) => o.city === prefs.origin) ?? origins[0];
  const f = dest.flights[prefs.flightIdx] ?? dest.flights[0];
  const h = dest.hotels[prefs.hotelIdx] ?? dest.hotels[0];
  const flight = { ...f, price: flightTotal(f, prefs) };
  const hotel = { ...h, price: h.nightly * prefs.nights * (prefs.travelers > 2 ? 2 : 1) };
  const acts = dest.activities.filter((a) => prefs.activityIds.includes(a.id)).map((a) => ({ ...a, price: a.pricePerPerson * prefs.travelers }));
  const totals = {
    flights: flight.price,
    hotel: hotel.price,
    activities: acts.reduce((s, a) => s + a.price, 0),
    total: 0,
  };
  totals.total = totals.flights + totals.hotel + totals.activities;

  const days: PlanDay[] = [];
  const totalDays = prefs.nights + 1;
  for (let i = 1; i <= totalDays; i++) {
    const items: DayItem[] = [];
    let title = "";
    if (i === 1) {
      title = "Arrive and settle in";
      items.push({ time: f.arrive.replace("+1", "").replace("+2", ""), kind: "flight", title: `Land at ${dest.airport}`, note: `${f.airline} ${f.code}` });
      items.push({ time: "15:00", kind: "hotel", title: `Check in at ${h.name}`, note: h.area });
      items.push({ time: "19:30", kind: "food", title: dest.food[0].name, note: dest.food[0].dish });
    } else if (i === totalDays) {
      title = "Fly home";
      items.push({ time: "10:00", kind: "free", title: "Slow breakfast, pack", note: "Late check-out requested" });
      items.push({ time: f.returnDepart, kind: "flight", title: `Depart ${dest.airport}`, note: `${f.airline} to ${origin.code}` });
    } else {
      const act = acts[(i - 2) % Math.max(acts.length, 1)];
      const isRest = i - 1 > prefs.nights - prefs.restDays;
      if (act && i - 2 < acts.length && !isRest) {
        title = act.title;
        items.push({ time: act.slot, kind: "activity", title: act.title, note: `${act.duration} · ${act.pricePerPerson ? `$${act.pricePerPerson} pp` : "Free"}` });
        const food = dest.food[(i - 1) % dest.food.length];
        items.push({ time: "13:00", kind: "food", title: food.name, note: food.dish });
        items.push({ time: "16:00", kind: "free", title: "Unplanned afternoon", note: "Left open on purpose" });
      } else {
        title = isRest ? "Rest day" : "Wander day";
        items.push({ time: "09:30", kind: "free", title: isRest ? "Nowhere to be" : "Explore the neighbourhood", note: "No bookings today" });
        const food = dest.food[(i + 1) % dest.food.length];
        items.push({ time: "19:00", kind: "food", title: food.name, note: food.dish });
      }
    }
    days.push({ day: i, title, items });
  }

  return { dest, prefs, originCode: origin.code, flight, hotel, activities: acts, days, totals, underBy: prefs.budget - totals.total };
}

/** Picks the best flight + stay combination that fits the budget, preferring the "Best" picks. */
export function fitToBudget(prefs: TripPrefs): { prefs: TripPrefs; fits: boolean; adjusted: boolean } {
  const dest = getDestination(prefs.destId);
  const combos: TripPrefs[] = [];
  dest.flights.forEach((_, fi) => dest.hotels.forEach((__, hi) => combos.push({ ...prefs, flightIdx: fi, hotelIdx: hi })));
  const score = (p: TripPrefs) => (p.flightIdx === 0 ? 0 : 1) + (p.hotelIdx === 0 ? 0 : 1);
  const fitting = combos.filter((p) => buildPlan(p).underBy >= 0).sort((a, b) => score(a) - score(b));
  if (fitting.length) {
    const pick = fitting[0];
    return { prefs: pick, fits: true, adjusted: pick.flightIdx !== prefs.flightIdx || pick.hotelIdx !== prefs.hotelIdx };
  }
  const cheapest = [...combos].sort((a, b) => buildPlan(a).totals.total - buildPlan(b).totals.total)[0];
  return { prefs: cheapest, fits: false, adjusted: true };
}
