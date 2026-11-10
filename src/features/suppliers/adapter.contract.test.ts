import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TripBrief } from "@/features/planner/tripBrief";
import { travelOfferSchema } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";
import type { SupplierAdapter } from "./adapter";
import { duffelAdapter } from "./duffel";
import { createSyntheticAdapter } from "./synthetic";

// One contract, every adapter. A new supplier (Viator, a hotel API, …) gets a
// `contract(...)` line below with its recorded fixtures and must pass all of it
// before the registry is allowed to route to it.

const brief: TripBrief = {
  origin: { city: "San Francisco", country: "United States" },
  destination: { city: "Honolulu", country: "United States" },
  timeZone: "UTC",
  travelers: 2,
  travelWindow: { startsAt: zonedDateTime("2026-07-10T00:00:00Z"), endsAt: zonedDateTime("2026-07-15T23:59:59Z") },
  hardBudget: { currency: "USD", amountMinorUnits: minorUnits(350000) },
  preferences: ["beach"],
  constraints: [],
};

type Fixture = { adapter: () => SupplierAdapter; live: boolean; setup?: () => void };

function contract(label: string, fixture: Fixture) {
  describe(`supplier adapter contract: ${label}`, () => {
    beforeEach(() => fixture.setup?.());
    afterEach(() => vi.unstubAllGlobals());

    for (const kind of fixture.adapter().kinds) {
      describe(`${kind} offers`, () => {
        it("returns only valid, uniquely-identified offers of the requested kind from itself", async () => {
          const adapter = fixture.adapter();
          const offers = await adapter.search(brief, kind);
          expect(offers.length).toBeGreaterThan(0);
          const ids = new Set<string>();
          for (const offer of offers) {
            expect(travelOfferSchema.safeParse(offer).success).toBe(true);
            expect(offer.productKind).toBe(kind);
            expect(offer.supplier).toBe(adapter.name);
            expect(offer.id.startsWith(`${kind}-`)).toBe(true);
            expect(ids.has(offer.id)).toBe(false);
            ids.add(offer.id);
            expect(offer.currency).toBe("USD");
            expect(Number.isInteger(offer.costMinorUnits) && offer.costMinorUnits >= 0).toBe(true);
            expect(Date.parse(offer.endsAt)).toBeGreaterThanOrEqual(Date.parse(offer.startsAt));
            expect(Date.parse(offer.expiresAt)).toBeGreaterThan(Date.parse(offer.retrievedAt));
            expect(offer.synthetic).toBe(!fixture.live);
            expect(offer.supplierPayeeEmail).toBeUndefined();
          }
        });

        it("reprices an offer it returned without changing what the offer is", async () => {
          const adapter = fixture.adapter();
          const [offer] = await adapter.search(brief, kind);
          const result = await adapter.reprice(offer);
          expect(result.status).not.toBe("unavailable");
          if (result.status === "unavailable") return;
          expect(result.offer).toMatchObject({ id: offer.id, productKind: kind, supplier: adapter.name, supplierRef: offer.supplierRef });
          expect(travelOfferSchema.safeParse(result.offer).success).toBe(true);
        });

        it("books an offer it returned, answers for that offer, and repeats the answer for the same key", async () => {
          const adapter = fixture.adapter();
          const [offer] = await adapter.search(brief, kind);
          const first = await adapter.book(offer, { idempotencyKey: "quote-1:" + offer.id });
          const again = await adapter.book(offer, { idempotencyKey: "quote-1:" + offer.id });
          expect(first).toMatchObject({ offerId: offer.id, status: "booked" });
          expect(again).toEqual(first);
        });

        it("reports a forced failure as a failed result, not an exception", async () => {
          const adapter = fixture.adapter();
          const [offer] = await adapter.search(brief, kind);
          const result = await adapter.book(offer, { idempotencyKey: "quote-1:" + offer.id, forceFail: true });
          expect(result).toMatchObject({ offerId: offer.id, status: "failed" });
        });
      });
    }
  });
}

contract("synthetic", {
  adapter: () => createSyntheticAdapter(() => new Date("2026-07-01T00:00:00Z")),
  live: false,
});

const duffelOffer = {
  id: "off_1",
  total_amount: "310.00",
  total_currency: "USD",
  expires_at: "2099-01-01T00:00:00Z",
  owner: { name: "Hawaiian Airlines" },
  slices: [{ segments: [{ departing_at: "2026-07-10T08:00:00", arriving_at: "2026-07-10T11:00:00" }] }],
};

contract("duffel", {
  adapter: () => duffelAdapter,
  live: true,
  setup: () => {
    process.env.DUFFEL_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const body = url.includes("query=San")
          ? { data: [{ iata_code: "SFO", time_zone: "UTC" }] }
          : url.includes("query=Honolulu")
            ? { data: [{ iata_code: "HNL", time_zone: "UTC" }] }
            : url.includes("offer_requests")
              ? { data: { offers: [duffelOffer] } }
              : url.includes("/air/offers/off_1")
                ? { data: duffelOffer }
                : { data: null };
        return { ok: true, status: 200, json: async () => body };
      }),
    );
  },
});
