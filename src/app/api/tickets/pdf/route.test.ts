import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { GET } from "./route";
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
  travellers: [{ firstName: "Mara", lastName: "Okafor", email: "mara@example.com" }],
};

const bookings = [
  { offerId: "flight-outbound-0", status: "booked" as const, amountMinorUnits: 39852, bookingRef: "SIM-SKYBAZAAR-1", failureReason: null, refundStatus: null },
  { offerId: "activity-3-wish-mount-fuji", status: "failed" as const, amountMinorUnits: 24000, bookingRef: null, failureReason: "Sold out", refundStatus: "COMPLETED" },
];

const get = (query: string) => GET(new Request(`http://localhost/api/tickets/pdf?${query}`));

describe("GET /api/tickets/pdf", () => {
  it("returns an inline PDF with a page per booked item only", async () => {
    vi.mocked(getQuoteByOrderId).mockResolvedValue(quote);
    vi.mocked(listBookings).mockResolvedValue(bookings);

    const response = await get("orderId=ORDER-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="tripweave-SIM-SKYBAZAAR-1.pdf"');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder("latin1").decode(bytes.slice(0, 4))).toBe("%PDF");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("refuses a ticket for a failed item, and 404s an item not on the trip", async () => {
    vi.mocked(getQuoteByOrderId).mockResolvedValue(quote);
    vi.mocked(listBookings).mockResolvedValue(bookings);
    expect((await get("orderId=ORDER-1&offerId=activity-3-wish-mount-fuji")).status).toBe(409);
    expect((await get("orderId=ORDER-1&offerId=nope")).status).toBe(404);
  });

  it("validates the query and applies the JSON route's access rules", async () => {
    expect((await get("")).status).toBe(400);
    vi.mocked(getQuoteByOrderId).mockResolvedValueOnce({ ...quote, status: "ordered" });
    expect((await get("orderId=ORDER-1")).status).toBe(409);
    vi.mocked(getQuoteByOrderId).mockResolvedValueOnce({ ...quote, userId: "someone-else" });
    expect((await get("orderId=ORDER-1")).status).toBe(404);
    vi.mocked(getQuoteByOrderId).mockResolvedValueOnce(null);
    expect((await get("orderId=nope")).status).toBe(404);
  });
});
