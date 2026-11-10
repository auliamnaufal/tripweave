import { describe, expect, it, vi } from "vitest";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";
import { runBookings, type BookingRunOptions, type BookingRunOutput, type BookingStreamEvent } from "./bookingExecutor";
import { reconcileBookings } from "./booking";

function offer(id: string, productKind: TravelOffer["productKind"], cost: number): TravelOffer {
  return {
    id,
    supplier: "synthetic",
    supplierRef: `synthetic:${id}`,
    productKind,
    title: id,
    summary: "",
    startsAt: zonedDateTime("2026-07-10T00:00:00Z"),
    endsAt: zonedDateTime("2026-07-10T03:00:00Z"),
    costMinorUnits: minorUnits(cost),
    currency: "USD",
    retrievedAt: "2026-07-01T00:00:00Z",
    expiresAt: "2026-07-01T00:15:00Z",
    cancellationTerms: null,
    synthetic: true,
  };
}

const offers = [offer("activity-1", "activity", 3000), offer("hotel-1", "hotel", 50000), offer("flight-1", "flight", 20000)];

async function drain(run: AsyncGenerator<BookingStreamEvent, BookingRunOutput>) {
  const events: BookingStreamEvent[] = [];
  let step = await run.next();
  while (!step.done) {
    events.push(step.value);
    step = await run.next();
  }
  return { events, output: step.value };
}

describe("runBookings", () => {
  it("books flights first, gives each booking its own idempotency key, and streams a call and result per item", async () => {
    const book = vi.fn<NonNullable<BookingRunOptions["book"]>>(async (o) => ({ offerId: o.id, status: "booked" as const, bookingRef: `ref-${o.id}` }));

    const { events, output } = await drain(runBookings(offers, { keyPrefix: "quote-1", book }));

    expect(book.mock.calls.map(([o, ctx]) => [o.id, ctx.idempotencyKey])).toEqual([
      ["flight-1", "quote-1:flight-1"],
      ["hotel-1", "quote-1:hotel-1"],
      ["activity-1", "quote-1:activity-1"],
    ]);
    expect(events.map((e) => `${e.kind}:${"tool" in e ? e.tool : ""}`)).toEqual([
      "tool-call:book_flight",
      "tool-result:book_flight",
      "tool-call:book_hotel",
      "tool-result:book_hotel",
      "tool-call:book_activity",
      "tool-result:book_activity",
    ]);
    expect(output.note).toBe("All 3 items booked.");
  });

  it("keeps going after a supplier throws, records it as failed without leaking the cause, and still reconciles", async () => {
    const book = vi.fn(async (o: TravelOffer) => {
      if (o.id === "hotel-1") throw new Error("raw 500 from hotel API with secrets");
      return { offerId: o.id, status: "booked" as const, bookingRef: `ref-${o.id}` };
    });

    const { output } = await drain(runBookings(offers, { keyPrefix: "q", book }));

    expect(output.results).toContainEqual({ offerId: "hotel-1", status: "failed", reason: "The supplier could not confirm this booking." });
    expect(output.results.filter((r) => r.status === "booked")).toHaveLength(2);
    expect(reconcileBookings(offers, output.results, 73000)).toMatchObject({ bookedMinorUnits: 23000, refundedMinorUnits: 50000 });
  });

  it("does not trust an answer about a different offer, or a booking with no reference", async () => {
    const book = vi.fn(async (o: TravelOffer) =>
      o.id === "flight-1"
        ? { offerId: "someone-else", status: "booked" as const, bookingRef: "x" }
        : { offerId: o.id, status: "booked" as const, bookingRef: "" },
    );

    const { output } = await drain(runBookings(offers, { keyPrefix: "q", book }));

    expect(output.results.every((r) => r.status === "failed")).toBe(true);
    expect(output.results.map((r) => r.offerId).sort()).toEqual(["activity-1", "flight-1", "hotel-1"]);
  });

  it("forces only the named offer to fail", async () => {
    const book = vi.fn(async (o: TravelOffer, ctx: { forceFail?: boolean }) =>
      ctx.forceFail
        ? { offerId: o.id, status: "failed" as const, reason: "forced" }
        : { offerId: o.id, status: "booked" as const, bookingRef: "r" },
    );

    const { output } = await drain(runBookings(offers, { keyPrefix: "q", forceFailureOfferId: "activity-1", book }));

    expect(output.results.find((r) => r.offerId === "activity-1")?.status).toBe("failed");
    expect(output.note).toBe("2 of 3 booked. 1 could not be booked and will be refunded.");
  });
});
