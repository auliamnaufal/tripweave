import { describe, expect, it } from "vitest";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";
import type { RepriceResult } from "@/features/suppliers/adapter";
import { repriceQuote } from "./reprice";

function offer(id: string, cost: number, extra: Partial<TravelOffer> = {}): TravelOffer {
  return {
    id, supplier: "s", supplierRef: `s:${id}`, productKind: "hotel", title: id, summary: "",
    startsAt: zonedDateTime("2026-07-10T00:00:00Z"), endsAt: zonedDateTime("2026-07-11T00:00:00Z"),
    costMinorUnits: minorUnits(cost), currency: "USD", retrievedAt: "2026-07-01T00:00:00Z", expiresAt: "2026-07-01T00:15:00Z",
    cancellationTerms: null, synthetic: true, ...extra,
  };
}

describe("repriceQuote", () => {
  it("keeps quote-level additions like a demo payee while taking the supplier's fresh price and expiry", async () => {
    const quoted = [offer("a", 100, { supplierPayeeEmail: "x@example.com" }), offer("b", 200)];
    const reprice = async (o: TravelOffer): Promise<RepriceResult> =>
      o.id === "b"
        ? { status: "changed", offer: { ...o, costMinorUnits: minorUnits(250), expiresAt: "2099-01-01T00:00:00Z" }, previousMinorUnits: 200 }
        : { status: "unchanged", offer: { ...o, supplierPayeeEmail: undefined, expiresAt: "2099-01-01T00:00:00Z" } };

    const result = await repriceQuote(quoted, reprice);

    expect(result).toMatchObject({ status: "changed", previousTotalMinorUnits: 300, totalMinorUnits: 350 });
    if (result.status !== "changed") return;
    expect(result.offers[0].supplierPayeeEmail).toBe("x@example.com");
    expect(result.offers.every((o) => o.expiresAt === "2099-01-01T00:00:00Z")).toBe(true);
  });

  it("stops at the first offer that is gone", async () => {
    const result = await repriceQuote([offer("a", 1), offer("b", 2)], async (o) =>
      o.id === "b" ? { status: "unavailable", reason: "Sold out." } : { status: "unchanged", offer: o },
    );
    expect(result).toEqual({ status: "unavailable", offerId: "b", reason: "Sold out." });
  });

  it("refuses an answer about a different offer", async () => {
    await expect(repriceQuote([offer("a", 1)], async (o) => ({ status: "unchanged", offer: { ...o, id: "zzz" } }))).rejects.toThrow();
  });
});
