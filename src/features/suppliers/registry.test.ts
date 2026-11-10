import { describe, expect, it, vi } from "vitest";
import type { TripBrief } from "@/features/planner/tripBrief";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";
import type { ProductKind, SupplierAdapter } from "./adapter";
import { adapterFor, assertBookable, CatalogUnavailableError, searchCatalog, type RegistryConfig } from "./registry";
import { createSyntheticAdapter } from "./synthetic";

const brief: TripBrief = {
  origin: { city: "San Francisco", country: "United States" },
  destination: { city: "Springfield", country: "United States" },
  timeZone: "UTC",
  travelers: 2,
  travelWindow: { startsAt: zonedDateTime("2026-07-10T00:00:00Z"), endsAt: zonedDateTime("2026-07-15T23:59:59Z") },
  hardBudget: { currency: "USD", amountMinorUnits: minorUnits(350000) },
  preferences: [],
  constraints: [],
};

const synthetic = createSyntheticAdapter(() => new Date("2026-07-01T00:00:00Z"));

function fakeAdapter(
  name: string,
  kinds: ProductKind[],
  search: SupplierAdapter["search"],
  configured = true,
  capability: SupplierAdapter["capability"] = "bookable",
): SupplierAdapter {
  return {
    name,
    kinds,
    capability,
    isConfigured: () => configured,
    search,
    reprice: async (offer) => ({ status: "unchanged", offer }),
    book: async (offer) => ({ offerId: offer.id, status: "booked", bookingRef: `${name}-${offer.id}` }),
  };
}

function offerFrom(name: string, kind: ProductKind, id: string): TravelOffer {
  return {
    id,
    supplier: name,
    supplierRef: `${name}:${id}`,
    productKind: kind,
    title: id,
    summary: "",
    startsAt: zonedDateTime("2026-07-11T10:00:00Z"),
    endsAt: zonedDateTime("2026-07-11T12:00:00Z"),
    costMinorUnits: minorUnits(1000),
    currency: "USD",
    retrievedAt: "2026-07-01T00:00:00Z",
    expiresAt: "2026-07-01T00:15:00Z",
    cancellationTerms: null,
    synthetic: false,
  };
}

function config(routes: Partial<RegistryConfig["routes"]>, timeoutMs = 200): RegistryConfig {
  const none = { primary: [], fallback: [], required: false };
  return { routes: { flight: none, hotel: none, activity: none, ...routes }, timeoutMs };
}

describe("searchCatalog", () => {
  it("merges every kind into one catalog and reports each source", async () => {
    const route = { primary: [synthetic], fallback: [], required: true };
    const { offers, sources } = await searchCatalog(brief, config({ flight: route, hotel: route, activity: route }));

    expect(new Set(offers.map((offer) => offer.productKind))).toEqual(new Set(["flight", "hotel", "activity"]));
    expect(sources.every((source) => source.status === "ok" && !source.fallback)).toBe(true);
  });

  it("uses the fallback only when every primary came back empty, and says so", async () => {
    const broken = fakeAdapter("hotels-api", ["hotel"], async () => {
      throw new Error("503 from provider");
    });
    const { offers, sources } = await searchCatalog(
      brief,
      config({ hotel: { primary: [broken], fallback: [synthetic], required: true } }),
    );

    expect(offers.every((offer) => offer.supplier === "synthetic")).toBe(true);
    expect(sources).toEqual([
      expect.objectContaining({ supplier: "hotels-api", status: "failed", fallback: false }),
      expect.objectContaining({ supplier: "synthetic", status: "ok", fallback: true }),
    ]);
  });

  it("does not wait forever for a slow supplier", async () => {
    const slow = fakeAdapter("slow", ["activity"], () => new Promise(() => {}));
    const { sources } = await searchCatalog(brief, config({ activity: { primary: [slow], fallback: [], required: false } }, 20));
    expect(sources[0]).toMatchObject({ supplier: "slow", status: "timeout" });
  });

  it("skips an adapter without credentials instead of failing", async () => {
    const search = vi.fn(async () => []);
    const unconfigured = fakeAdapter("needs-key", ["activity"], search, false);
    const { sources } = await searchCatalog(brief, config({ activity: { primary: [unconfigured], fallback: [], required: false } }));
    expect(search).not.toHaveBeenCalled();
    expect(sources[0].status).toBe("not-configured");
  });

  it("fails the search when a required kind has no offers from anyone", async () => {
    const empty = fakeAdapter("airline", ["flight"], async () => []);
    await expect(
      searchCatalog(brief, config({ flight: { primary: [empty], fallback: [], required: true } })),
    ).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  it("drops offers that break the contract: wrong kind, wrong supplier, invalid shape", async () => {
    const sloppy = fakeAdapter("sloppy", ["hotel"], async () => [
      offerFrom("sloppy", "hotel", "hotel-good"),
      offerFrom("sloppy", "activity", "activity-wrong-kind"),
      offerFrom("someone-else", "hotel", "hotel-wrong-supplier"),
      // A raw value, as a buggy mapper would produce it (the branded helper would refuse it).
      { ...offerFrom("sloppy", "hotel", "hotel-negative"), costMinorUnits: -5 as never },
    ]);
    const { offers, sources } = await searchCatalog(brief, config({ hotel: { primary: [sloppy], fallback: [], required: false } }));

    expect(offers.map((offer) => offer.id)).toEqual(["hotel-good"]);
    expect(sources[0]).toMatchObject({ offers: 1, rejected: 3 });
  });

  it("never lets two suppliers share an offer id", async () => {
    const a = fakeAdapter("a", ["hotel"], async () => [offerFrom("a", "hotel", "hotel-1")]);
    const b = fakeAdapter("b", ["hotel"], async () => [offerFrom("b", "hotel", "hotel-1")]);
    const { offers } = await searchCatalog(brief, config({ hotel: { primary: [a, b], fallback: [], required: false } }));
    expect(offers).toHaveLength(1);
  });
});

describe("adapterFor", () => {
  it("routes an offer back to the adapter that produced it, and refuses an unknown supplier", () => {
    const viator = fakeAdapter("viator", ["activity"], async () => []);
    const routes = config({ activity: { primary: [viator], fallback: [synthetic], required: false } });

    expect(adapterFor(offerFrom("viator", "activity", "activity-1"), routes)).toBe(viator);
    expect(() => adapterFor(offerFrom("unknown", "activity", "activity-1"), routes)).toThrow();
    expect(() => adapterFor(offerFrom("viator", "hotel", "hotel-1"), routes)).toThrow();
  });
});

describe("bookable vs deeplink sources", () => {
  const key = "flight:AA123@2026-07-11T10:00";
  const airline = fakeAdapter("airline", ["flight"], async () => [{ ...offerFrom("airline", "flight", "flight-air-0"), costMinorUnits: minorUnits(50000), productKey: key }]);
  const meta = fakeAdapter(
    "metasearch",
    ["flight"],
    async () => [
      { ...offerFrom("metasearch", "flight", "flight-meta-0"), costMinorUnits: minorUnits(45000), productKey: key, listingUrl: "https://meta.example/f/1" },
      // No listing page: a deeplink offer nobody could act on.
      { ...offerFrom("metasearch", "flight", "flight-meta-1"), productKey: key },
    ],
    true,
    "deeplink",
  );

  it("keeps deeplink prices out of the catalog but reports them as cheaper elsewhere", async () => {
    const { offers, comparisons, sources } = await searchCatalog(
      brief,
      config({ flight: { primary: [airline, meta], fallback: [], required: true } }),
    );

    expect(offers.map((offer) => offer.id)).toEqual(["flight-air-0"]);
    expect(comparisons[0]).toMatchObject({ cheaperElsewhereMinorUnits: 5000, cheapest: { supplier: "metasearch", bookable: false } });
    expect(sources.find((source) => source.supplier === "metasearch")).toMatchObject({ capability: "deeplink", offers: 1, rejected: 1 });
  });

  it("still fails a required kind when only deeplink prices exist, and still tries the bookable fallback first", async () => {
    await expect(
      searchCatalog(brief, config({ flight: { primary: [meta], fallback: [], required: true } })),
    ).rejects.toBeInstanceOf(CatalogUnavailableError);

    const { offers } = await searchCatalog(brief, config({ flight: { primary: [meta], fallback: [airline], required: true } }));
    expect(offers.map((offer) => offer.id)).toEqual(["flight-air-0"]);
  });

  it("refuses to price or book a deeplink offer", () => {
    const routes = config({ flight: { primary: [airline, meta], fallback: [], required: true } });
    const metaOffer = { ...offerFrom("metasearch", "flight", "flight-meta-0"), listingUrl: "https://meta.example/f/1" };
    expect(() => assertBookable([metaOffer], routes)).toThrow(/price-comparison source/);
    expect(() => assertBookable([offerFrom("airline", "flight", "flight-air-0")], routes)).not.toThrow();
  });
});
