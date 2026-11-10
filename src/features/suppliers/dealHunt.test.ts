import { describe, expect, it, vi } from "vitest";
import type { TravelOffer } from "@/features/planner/travelOffer";
import type { TripBrief } from "@/features/planner/tripBrief";
import { minorUnits, zonedDateTime } from "@/features/planner/types";
import type { SupplierAdapter } from "./adapter";
import { compareOffers, marketBenchmarks } from "./compare";
import { summarizeDeal } from "./deal";
import { memoizeSearch } from "./memo";
import { createPartnerAdapter, PARTNER_PROFILES, resell } from "./partners";

function flight(supplier: string, id: string, cost: number, extra: Partial<TravelOffer> = {}): TravelOffer {
  return {
    id,
    supplier,
    supplierRef: `${supplier}:${id}`,
    productKind: "flight",
    title: "SFO to HNL, direct",
    summary: "",
    startsAt: zonedDateTime("2026-12-10T08:00:00-08:00"),
    endsAt: zonedDateTime("2026-12-10T11:00:00-10:00"),
    costMinorUnits: minorUnits(cost),
    currency: "USD",
    retrievedAt: "2026-11-10T00:00:00Z",
    expiresAt: "2026-11-10T00:15:00Z",
    cancellationTerms: null,
    synthetic: false,
    productKey: "flight:AS844@2026-12-10T08:00",
    marketKey: "flight-market:SFO-HNL@2026-12-10",
    ...extra,
  };
}

const brief = {} as TripBrief;

describe("simulated partners", () => {
  const [nusantara, skybazaar] = PARTNER_PROFILES;

  it("resell the same product at a stable, partner-specific price within their range", () => {
    const base = flight("duffel", "flight-outbound-0", 40000);
    const a = resell({ ...nusantara, missingShare: 0 }, base)!;
    const again = resell({ ...nusantara, missingShare: 0 }, base)!;
    const b = resell({ ...skybazaar, missingShare: 0 }, base)!;

    expect(a).toMatchObject({ id: "flight-nt-outbound-0", supplier: "nusantara-trips", productKey: base.productKey, synthetic: true });
    expect(again.costMinorUnits).toBe(a.costMinorUnits);
    expect(a.costMinorUnits).toBeGreaterThanOrEqual(40000 * 0.95);
    expect(a.costMinorUnits).toBeLessThanOrEqual(40000 * 1.07);
    expect(b.id).toBe("flight-sb-outbound-0");
    expect(b.cancellationTerms).toContain("Cabin bag only");
  });

  it("never resell what can't be compared or was paid to someone else", () => {
    expect(resell(nusantara, flight("duffel", "flight-x", 1, { productKey: undefined }))).toBeNull();
    expect(resell(nusantara, flight("duffel", "flight-x", 1, { supplierPayeeEmail: "x@example.com" }))).toBeNull();
  });

  it("reprice through the source and keep their own margin", async () => {
    const base = flight("duffel", "flight-outbound-0", 40000);
    const source: SupplierAdapter = {
      name: "duffel",
      kinds: ["flight"],
      capability: "bookable",
      isConfigured: () => true,
      search: async () => [base],
      reprice: vi.fn(async (offer: TravelOffer) => ({ status: "changed" as const, offer: { ...offer, costMinorUnits: minorUnits(44000) }, previousMinorUnits: 40000 })),
      book: async () => ({ offerId: "x", status: "booked" as const, bookingRef: "r" }),
    };
    const partner = createPartnerAdapter({ ...nusantara, missingShare: 0 }, { flight: source });
    const [resold] = await partner.search(brief, "flight");

    const result = await partner.reprice(resold);

    // The source was asked about its own offer, not the partner's.
    expect(source.reprice).toHaveBeenCalledWith(expect.objectContaining({ id: "flight-outbound-0", supplier: "duffel", supplierRef: base.supplierRef }));
    expect(result.status).toBe("changed");
    if (result.status !== "changed") return;
    expect(result.offer.id).toBe(resold.id);
    expect(result.offer.costMinorUnits / 44000).toBeCloseTo(resold.costMinorUnits / 40000, 3);
  });
});

describe("memoizeSearch", () => {
  it("shares one in-flight search per brief and kind, and forgets failures", async () => {
    let calls = 0;
    const source: SupplierAdapter = {
      name: "s",
      kinds: ["flight"],
      capability: "bookable",
      isConfigured: () => true,
      search: async () => {
        calls += 1;
        if (calls === 1) throw new Error("flaky");
        return [];
      },
      reprice: async () => ({ status: "unavailable", reason: "" }),
      book: async () => ({ offerId: "x", status: "failed", reason: "" }),
    };
    const memo = memoizeSearch(source);
    await expect(memo.search(brief, "flight")).rejects.toThrow();
    await Promise.all([memo.search(brief, "flight"), memo.search(brief, "flight")]);
    expect(calls).toBe(2);
  });
});

describe("market benchmarks and the deal summary", () => {
  const duffel = flight("duffel", "flight-outbound-0", 46000);
  const partner = flight("skybazaar", "flight-sb-outbound-0", 43000);
  const market = (date: string, cost: number) =>
    flight("aviasales", `flight-tp-out-${date}`, cost, {
      productKey: undefined,
      marketKey: `flight-market:SFO-HNL@${date}`,
      listingUrl: "https://www.aviasales.com/search/x?marker=1",
    });

  it("finds the cheapest bookable fare that day and the cheapest market fare nearby", () => {
    const [benchmark] = marketBenchmarks([duffel, partner], [market("2026-12-10", 45000), market("2026-12-08", 30000), market("2026-12-30", 10000)]);
    expect(benchmark).toMatchObject({
      route: "SFO-HNL",
      date: "2026-12-10",
      bestBookable: { supplier: "skybazaar", costMinorUnits: 43000 },
      sameDay: { costMinorUnits: 45000 },
      // Dec 30 is cheaper but three weeks away: outside the window.
      nearby: { date: "2026-12-08", costMinorUnits: 30000 },
    });
  });

  it("states platforms, savings against the priciest platform, and a date tip, from data alone", () => {
    const { catalog, comparisons } = compareOffers([duffel, partner]);
    const markets = marketBenchmarks([duffel, partner], [market("2026-12-08", 30000)]);
    const sources = [
      { supplier: "duffel", kind: "flight" as const, status: "ok" as const, offers: 1, rejected: 0, fallback: false, capability: "bookable" as const },
      { supplier: "skybazaar", kind: "flight" as const, status: "ok" as const, offers: 1, rejected: 0, fallback: false, capability: "bookable" as const },
      { supplier: "aviasales", kind: "flight" as const, status: "ok" as const, offers: 1, rejected: 0, fallback: false, capability: "deeplink" as const },
    ];

    const deal = summarizeDeal(catalog, comparisons, markets, sources);

    expect(catalog.map((offer) => offer.supplier)).toEqual(["skybazaar"]);
    expect(deal.platforms.map((p) => [p.label, p.data, p.role])).toEqual([
      ["Duffel", "live", "bookable"],
      ["SkyBazaar", "simulated", "bookable"],
      ["Aviasales", "live", "deeplink"],
    ]);
    expect(deal.items[0]).toMatchObject({ chosen: { label: "SkyBazaar", costMinorUnits: 43000 }, platformsCompared: 2, savedMinorUnits: 3000 });
    expect(deal.savedMinorUnits).toBe(3000);
    expect(deal.tips[0]).toMatchObject({ betterDate: "2026-12-08", marketFareMinorUnits: 30000, bookableMinorUnits: 43000, source: "Aviasales" });
  });
});
