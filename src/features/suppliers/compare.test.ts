import { describe, expect, it } from "vitest";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";
import { compareOffers, comparisonsFor } from "./compare";

function offer(supplier: string, id: string, cost: number, extra: Partial<TravelOffer> = {}): TravelOffer {
  return {
    id,
    supplier,
    supplierRef: `${supplier}:${id}`,
    productKind: "flight",
    title: "SFO to LIS, direct",
    summary: "",
    startsAt: zonedDateTime("2026-12-10T06:58:00-08:00"),
    endsAt: zonedDateTime("2026-12-11T03:42:00+00:00"),
    costMinorUnits: minorUnits(cost),
    currency: "USD",
    retrievedAt: "2026-11-10T00:00:00Z",
    expiresAt: "2026-11-10T00:15:00Z",
    cancellationTerms: null,
    synthetic: false,
    ...extra,
  };
}

const KEY = "flight:AA123@2026-12-10T06:58";

describe("compareOffers", () => {
  it("keeps the cheapest bookable platform's fares for a product and drops the same product from pricier ones", () => {
    const duffelBasic = offer("duffel", "flight-d-0", 46715, { productKey: KEY });
    const duffelFlex = offer("duffel", "flight-d-1", 61000, { productKey: KEY, cancellationTerms: "Refundable" });
    const other = offer("otherair", "flight-o-0", 48000, { productKey: KEY });

    const { catalog, comparisons } = compareOffers([duffelBasic, duffelFlex, other]);

    // Both Duffel fares survive (the refundable one is a real choice), the pricier platform doesn't.
    expect(catalog.map((o) => o.id).sort()).toEqual(["flight-d-0", "flight-d-1"]);
    expect(comparisons).toHaveLength(1);
    expect(comparisons[0].bestBookable).toMatchObject({ supplier: "duffel", costMinorUnits: 46715 });
    expect(comparisons[0].options.map((o) => o.costMinorUnits)).toEqual([46715, 48000, 61000]);
    expect(comparisons[0].cheaperElsewhereMinorUnits).toBe(0);
  });

  it("reports a cheaper deeplink price without ever putting it in the catalog", () => {
    const duffel = offer("duffel", "flight-d-0", 46715, { productKey: KEY });
    const meta = offer("aviasales", "flight-a-0", 43900, { productKey: KEY, listingUrl: "https://www.aviasales.com/search/x" });

    const { catalog, comparisons } = compareOffers([duffel], [meta]);

    expect(catalog.map((o) => o.id)).toEqual(["flight-d-0"]);
    expect(comparisons[0]).toMatchObject({
      cheapest: { supplier: "aviasales", bookable: false, listingUrl: "https://www.aviasales.com/search/x" },
      bestBookable: { supplier: "duffel" },
      cheaperElsewhereMinorUnits: 2815,
    });
  });

  it("never merges offers without a product key, and ignores deeplink offers that match nothing bookable", () => {
    const a = offer("duffel", "flight-d-0", 100);
    const b = offer("otherair", "flight-o-0", 90);
    const orphan = offer("aviasales", "flight-a-0", 10, { productKey: "flight:ZZ1@2026-12-10T00:00", listingUrl: "https://x.example/1" });

    const { catalog, comparisons } = compareOffers([a, b], [orphan]);

    expect(catalog).toHaveLength(2);
    expect(comparisons).toEqual([]);
  });

  it("filters comparisons down to the products a plan contains", () => {
    const duffel = offer("duffel", "flight-d-0", 46715, { productKey: KEY });
    const other = offer("otherair", "flight-o-0", 48000, { productKey: KEY });
    const { comparisons } = compareOffers([duffel, other]);
    expect(comparisonsFor([duffel], comparisons)).toHaveLength(1);
    expect(comparisonsFor([offer("duffel", "x", 1)], comparisons)).toHaveLength(0);
  });
});
