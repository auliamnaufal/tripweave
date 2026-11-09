import { describe, expect, it } from "vitest";
import { parseBookingAgentFinalMessage } from "./bookingAgent";
import { makeBookingTools } from "./tools";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";

const offers: TravelOffer[] = [
  {
    id: "flight-1",
    supplier: "duffel",
    supplierRef: "duffel:1",
    productKind: "flight",
    title: "Flight",
    summary: "",
    startsAt: zonedDateTime("2026-07-10T00:00:00Z"),
    endsAt: zonedDateTime("2026-07-10T03:00:00Z"),
    costMinorUnits: minorUnits(62000),
    currency: "USD",
    retrievedAt: "2026-07-01T00:00:00Z",
    expiresAt: "2026-07-01T00:15:00Z",
    cancellationTerms: null,
    synthetic: false,
  },
  {
    id: "hotel-main",
    supplier: "synthetic",
    supplierRef: "synthetic:hotel-main",
    productKind: "hotel",
    title: "Hotel",
    summary: "",
    startsAt: zonedDateTime("2026-07-10T15:00:00Z"),
    endsAt: zonedDateTime("2026-07-14T10:00:00Z"),
    costMinorUnits: minorUnits(95000),
    currency: "USD",
    retrievedAt: "2026-07-01T00:00:00Z",
    expiresAt: "2026-07-01T00:15:00Z",
    cancellationTerms: null,
    synthetic: true,
  },
];

describe("parseBookingAgentFinalMessage", () => {
  it("parses a plain JSON final message", () => {
    expect(
      parseBookingAgentFinalMessage(
        '{"results":[{"offerId":"a","status":"booked","bookingRef":"ref"}],"note":"booked"}',
      ),
    ).toEqual({ results: [{ offerId: "a", status: "booked", bookingRef: "ref" }], note: "booked" });
  });

  it("parses a fenced JSON final message with a failed result", () => {
    const fenced =
      '```json\n{"results":[{"offerId":"a","status":"failed","reason":"sold out"}],"note":"one failed"}\n```';
    expect(parseBookingAgentFinalMessage(fenced)).toEqual({
      results: [{ offerId: "a", status: "failed", reason: "sold out" }],
      note: "one failed",
    });
  });

  it("rejects a result missing required fields", () => {
    expect(() => parseBookingAgentFinalMessage('{"results":[{"offerId":"a"}]}')).toThrow();
  });
});

describe("makeBookingTools", () => {
  it("exposes the three booking tools by name", () => {
    const { tools } = makeBookingTools(offers);
    expect(tools.map((item) => item.name)).toEqual(["book_flight", "book_hotel", "book_activity"]);
  });

  it("books a matching-kind offer and rejects a kind mismatch", async () => {
    const { tools } = makeBookingTools(offers);
    const bookFlight = tools[0];
    const bookHotel = tools[1];

    const flightResult = JSON.parse((await bookFlight.invoke({ offerId: "flight-1" })) as string);
    expect(flightResult).toEqual({ offerId: "flight-1", status: "booked", bookingRef: "SIM-DUFFEL-flight-1" });

    const mismatch = JSON.parse((await bookHotel.invoke({ offerId: "flight-1" })) as string);
    expect(mismatch).toEqual({ offerId: "flight-1", status: "failed", reason: "Expected a hotel, got a flight." });
  });

  it("forces the named offer to fail booking", async () => {
    const { tools } = makeBookingTools(offers, "hotel-main");
    const bookHotel = tools[1];

    const result = JSON.parse((await bookHotel.invoke({ offerId: "hotel-main" })) as string);
    expect(result.status).toBe("failed");
  });
});
