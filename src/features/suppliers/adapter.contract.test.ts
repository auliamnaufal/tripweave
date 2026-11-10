import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TripBrief } from "@/features/planner/tripBrief";
import { travelOfferSchema, type TravelOffer } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";
import type { SupplierAdapter } from "./adapter";
import { duffelAdapter } from "./duffel";
import { createSyntheticAdapter } from "./synthetic";
import { liteApiAdapter } from "./liteapi";
import { createPartnerAdapter, PARTNER_PROFILES } from "./partners";
import { travelpayoutsAdapter } from "./travelpayouts";

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

type Fixture = {
  adapter: () => SupplierAdapter;
  live: boolean;
  setup?: () => void;
  /** Extra checks after the repeat-booking test, e.g. that the supplier saw one booking. */
  afterBook?: (offer: TravelOffer) => void;
};

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
            if (adapter.capability === "deeplink") expect(offer.listingUrl?.startsWith("https://")).toBe(true);
          }
        });

        if (fixture.adapter().capability === "deeplink") {
          it("never prices or books: a deeplink source only points to its own page", async () => {
            const adapter = fixture.adapter();
            const [offer] = await adapter.search(brief, kind);
            await expect(adapter.reprice(offer)).rejects.toThrow();
            await expect(adapter.book(offer, { idempotencyKey: "k" })).rejects.toThrow();
          });
          return;
        }

        it("reprices an offer it returned without changing what the offer is", async () => {
          const adapter = fixture.adapter();
          const [offer] = await adapter.search(brief, kind);
          const result = await adapter.reprice(offer);
          expect(result.status).not.toBe("unavailable");
          if (result.status === "unavailable") return;
          expect(result.offer).toMatchObject({ id: offer.id, productKind: kind, supplier: adapter.name, supplierRef: offer.supplierRef });
          expect(travelOfferSchema.safeParse(result.offer).success).toBe(true);
        });

        it("books an offer it returned, answers for that offer, and treats a repeat of the same key as already booked", async () => {
          const adapter = fixture.adapter();
          const [offer] = await adapter.search(brief, kind);
          const first = await adapter.book(offer, { idempotencyKey: "quote-1:" + offer.id });
          const again = await adapter.book(offer, { idempotencyKey: "quote-1:" + offer.id });
          expect(first).toMatchObject({ offerId: offer.id, status: "booked" });
          expect(again).toMatchObject({ offerId: offer.id, status: "booked" });
          fixture.afterBook?.(offer);
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

// Recorded from the LiteAPI sandbox (trimmed): data/hotels, hotels/rates,
// rates/prebook, rates/book, and the 4005 answer to a repeated clientReference.
const liteBookings = new Set<string>();
let liteBookCalls = 0;

contract("liteapi", {
  adapter: () => liteApiAdapter,
  live: true,
  setup: () => {
    process.env.LITEAPI_KEY = "sand_test";
    process.env.DUFFEL_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
        if (url.includes("places/suggestions")) {
          return json(200, { data: [{ iata_code: "HNL", time_zone: "Pacific/Honolulu", iata_country_code: "US" }] });
        }
        if (url.includes("/data/hotels")) {
          return json(200, { data: [{ id: "lp1", name: "Waikiki Shore Hotel", stars: 4, rating: 8.9, reviewCount: 1200, address: "2161 Kalia Rd" }] });
        }
        if (url.includes("/hotels/rates")) {
          return json(200, {
            data: [
              {
                hotelId: "lp1",
                roomTypes: [
                  {
                    offerId: "OFFER-1",
                    offerRetailRate: { amount: 812.4, currency: "USD" },
                    rates: [{ name: "Deluxe King", boardName: "Room Only", cancellationPolicies: { refundableTag: "RFN", cancelPolicyInfos: [{ cancelTime: "2026-07-08 10:00:00" }] } }],
                  },
                ],
              },
            ],
          });
        }
        if (url.includes("/rates/prebook")) return json(200, { data: { prebookId: "PB-1", price: 812.4, currency: "USD" } });
        if (url.includes("/rates/book")) {
          liteBookCalls += 1;
          const ref = (JSON.parse(String(init?.body)) as { clientReference: string }).clientReference;
          if (liteBookings.has(ref)) return json(200, { error: { code: 4005, message: "duplicate booking attempt with existing client reference" } });
          liteBookings.add(ref);
          return json(200, { data: { bookingId: "BK-1", status: "CONFIRMED" } });
        }
        return json(404, { error: { message: "unexpected" } });
      }),
    );
  },
  afterBook: () => expect(liteBookings.size).toBe(1),
});

contract("simulated partner", {
  adapter: () => {
    const base = createSyntheticAdapter(() => new Date("2026-07-01T00:00:00Z"));
    return createPartnerAdapter({ ...PARTNER_PROFILES[0], missingShare: 0 }, { hotel: base, activity: base });
  },
  live: false,
});

contract("aviasales (travelpayouts)", {
  adapter: () => travelpayoutsAdapter,
  live: true,
  setup: () => {
    process.env.TRAVELPAYOUTS_TOKEN = "tp-test";
    process.env.TRAVELPAYOUTS_MARKER = "803";
    process.env.DUFFEL_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
        if (url.includes("places/suggestions")) return json({ data: [{ iata_code: "HNL", time_zone: "Pacific/Honolulu", iata_country_code: "US" }] });
        return json({
          success: true,
          data: [
            { origin: "SFO", destination: "HNL", price: 172, airline: "AS", flight_number: "844", departure_at: "2026-07-11T20:00:00-08:00", transfers: 0, duration_to: 353, link: "/search/SFO1107HNL1?t=AS1", gate: "Trip.com" },
          ],
        });
      }),
    );
  },
});

describe("liteapi idempotency", () => {
  it("sent the second booking to LiteAPI but LiteAPI kept exactly one", () => {
    expect(liteBookCalls).toBeGreaterThanOrEqual(2);
    expect(liteBookings.size).toBe(1);
  });
});
