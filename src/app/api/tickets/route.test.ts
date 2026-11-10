import { describe, expect, it, vi } from "vitest";
import { GET, type TicketsResponse } from "./route";
import { getQuoteByOrderId, listBookings } from "@/features/quotes/quoteStore";
import { toTravelOffer } from "@/features/planner/travelOffer";
import type { PlanQuote } from "@/features/quotes/quote";

vi.mock("@/features/quotes/quoteStore", () => ({ getQuoteByOrderId: vi.fn(), listBookings: vi.fn() }));
vi.mock("@/lib/supabase/authedUser", () => ({ authedUser: vi.fn(async () => ({ supabase: null, user: null })) }));

const base = {
  supplierRef: "x",
  summary: "",
  currency: "USD" as const,
  retrievedAt: "2026-11-10T00:00:00Z",
  expiresAt: "2026-11-10T00:15:00Z",
  cancellationTerms: null,
  synthetic: true,
};
const flight = toTravelOffer({ ...base, id: "flight-outbound-0", supplier: "skybazaar", productKind: "flight", title: "SFO to NRT, direct", startsAt: "2026-12-10T06:58:00-08:00", endsAt: "2026-12-11T11:31:00+09:00", costMinorUnits: 39852 });
const tour = toTravelOffer({ ...base, id: "activity-3-wish-mount-fuji", supplier: "synthetic", productKind: "activity", title: "Mount Fuji day trip", startsAt: "2026-12-12T08:00:00Z", endsAt: "2026-12-12T17:00:00Z", costMinorUnits: 24000 });

const quote: PlanQuote = {
  id: "q",
  userId: null,
  offers: [tour, flight],
  totalMinorUnits: 63852,
  status: "completed",
  paypalOrderId: "ORDER-1",
  approveUrl: null,
  expiresAt: "",
  travellers: [
    { firstName: "Mara", lastName: "Okafor", email: "mara@example.com" },
    { firstName: "Daniel", lastName: "Reyes" },
  ],
};

describe("GET /api/tickets", () => {
  it("builds one ticket per paid item from stored bookings, in time order, with a reference-only QR", async () => {
    vi.mocked(getQuoteByOrderId).mockResolvedValue(quote);
    vi.mocked(listBookings).mockResolvedValue([
      { offerId: "flight-outbound-0", status: "booked", amountMinorUnits: 39852, bookingRef: "SIM-SKYBAZAAR-1", failureReason: null, refundStatus: null },
      { offerId: "activity-3-wish-mount-fuji", status: "failed", amountMinorUnits: 24000, bookingRef: null, failureReason: "Sold out", refundStatus: "COMPLETED" },
    ]);

    const response = await GET(new Request("http://localhost/api/tickets?orderId=ORDER-1"));
    const body = (await response.json()) as TicketsResponse;

    expect(response.status).toBe(200);
    expect(body.travellers).toEqual([{ firstName: "Mara", lastName: "Okafor" }, { firstName: "Daniel", lastName: "Reyes" }]);
    expect(body.items.map((item) => item.offerId)).toEqual(["flight-outbound-0", "activity-3-wish-mount-fuji"]);
    expect(body.items[0]).toMatchObject({ status: "booked", bookingRef: "SIM-SKYBAZAAR-1", platform: { label: "SkyBazaar", data: "simulated" } });
    expect(body.items[0].qr).toBe("TRIPWEAVE|ORDER-1|flight-outbound-0|SIM-SKYBAZAAR-1");
    expect(body.items[0].qr).not.toMatch(/Mara|Okafor|@/);
    expect(body.items[1]).toMatchObject({ status: "failed", refunded: true });
  });

  it("refuses an unpaid or unknown order", async () => {
    vi.mocked(getQuoteByOrderId).mockResolvedValueOnce({ ...quote, status: "ordered" });
    expect((await GET(new Request("http://localhost/api/tickets?orderId=ORDER-1"))).status).toBe(409);
    vi.mocked(getQuoteByOrderId).mockResolvedValueOnce(null);
    expect((await GET(new Request("http://localhost/api/tickets?orderId=nope"))).status).toBe(404);
  });
});
