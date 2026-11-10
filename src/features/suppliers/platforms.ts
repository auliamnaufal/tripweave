// Display facts about every platform the registry can search. Client-safe:
// no secrets, no network. "simulated" platforms stand in for B2B partners
// Tripweave would contract with (OTAs like Traveloka Partners Network or
// tiket.com B2B); their prices are generated, their inventory is real.

export type PlatformInfo = {
  label: string;
  /** live: real API data. simulated: a stand-in partner for the demo. */
  data: "live" | "simulated";
  /** bookable: Tripweave can sell it in one PayPal payment. deeplink: price check only. */
  role: "bookable" | "deeplink";
  blurb: string;
};

export const PLATFORMS: Record<string, PlatformInfo> = {
  duffel: { label: "Duffel", data: "live", role: "bookable", blurb: "Airline fares via Duffel (test mode)" },
  liteapi: { label: "LiteAPI", data: "live", role: "bookable", blurb: "Hotel rates via LiteAPI (sandbox bookings)" },
  aviasales: { label: "Aviasales", data: "live", role: "deeplink", blurb: "Market fares via Travelpayouts (price check)" },
  "nusantara-trips": { label: "Nusantara Trips", data: "simulated", role: "bookable", blurb: "Simulated OTA partner" },
  skybazaar: { label: "SkyBazaar", data: "simulated", role: "bookable", blurb: "Simulated OTA partner" },
  synthetic: { label: "Local operators", data: "simulated", role: "bookable", blurb: "Sample activities and stays" },
};

export function platformInfo(supplier: string): PlatformInfo {
  return PLATFORMS[supplier] ?? { label: supplier, data: "live", role: "bookable", blurb: supplier };
}
