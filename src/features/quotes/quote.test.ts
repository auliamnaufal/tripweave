import { describe, expect, it } from "vitest";
import { toTravelOffer } from "@/features/planner/travelOffer";
import { canAccess, demoFailureOfferId, isExpired, quoteExpiry, quoteTotal, requestIds, withDemoPayee } from "./quote";

const base = {
  supplier: "synthetic",
  supplierRef: "s",
  title: "",
  summary: "",
  startsAt: "2026-07-10T00:00:00Z",
  endsAt: "2026-07-10T03:00:00Z",
  currency: "USD" as const,
  retrievedAt: "2026-07-01T00:00:00Z",
  cancellationTerms: null,
  synthetic: true,
};
const flight = toTravelOffer({ ...base, id: "f", productKind: "flight", costMinorUnits: 100, expiresAt: "2026-07-01T00:15:00Z" });
const hotel = toTravelOffer({ ...base, id: "h", productKind: "hotel", costMinorUnits: 250, expiresAt: "2026-07-01T00:10:00Z" });

describe("plan quote rules", () => {
  it("expires with its stalest offer and totals every offer", () => {
    expect(quoteExpiry([flight, hotel])).toBe("2026-07-01T00:10:00.000Z");
    expect(quoteTotal([flight, hotel])).toBe(350);
    expect(isExpired({ expiresAt: "2026-07-01T00:10:00.000Z" }, Date.parse("2026-07-01T00:09:59Z"))).toBe(false);
    expect(isExpired({ expiresAt: "2026-07-01T00:10:00.000Z" }, Date.parse("2026-07-01T00:10:00Z"))).toBe(true);
  });

  it("lets anyone with the id pay a guest quote, but only the owner pay an owned one", () => {
    expect(canAccess({ userId: null }, undefined)).toBe(true);
    expect(canAccess({ userId: "a" }, "a")).toBe(true);
    expect(canAccess({ userId: "a" }, "b")).toBe(false);
    expect(canAccess({ userId: "a" }, null)).toBe(false);
  });

  it("only routes a non-flight offer of this quote to a demo payee", () => {
    expect(withDemoPayee([flight, hotel], { offerId: "h", email: "x@example.com" })[1].supplierPayeeEmail).toBe("x@example.com");
    expect(() => withDemoPayee([flight, hotel], { offerId: "f", email: "x@example.com" })).toThrow();
    expect(() => withDemoPayee([flight, hotel], { offerId: "nope", email: "x@example.com" })).toThrow();
  });

  it("derives one stable PayPal idempotency key per money movement", () => {
    expect(requestIds.order("q")).toBe(requestIds.order("q"));
    expect(requestIds.refund("q", "h")).not.toBe(requestIds.refund("q", "f"));
    expect(requestIds.refund("q".repeat(200), "h").length).toBeLessThanOrEqual(108);
  });
});

describe("demoFailureOfferId", () => {
  const activity = (id: string, startsAt: string, extra = {}) =>
    toTravelOffer({ ...base, id, productKind: "activity", costMinorUnits: 1000, startsAt, endsAt: startsAt, expiresAt: "2026-07-01T00:15:00Z", ...extra });
  const early = activity("activity-2-a", "2026-07-11T09:00:00Z");
  const late = activity("activity-3-b", "2026-07-12T09:00:00Z");

  it("forces nothing outside demo mode, whatever the request asks", () => {
    delete process.env.DEMO_MODE;
    expect(demoFailureOfferId([flight, late, early], "activity-3-b")).toBeUndefined();
  });

  it("fails the earliest activity by default in demo mode, or the requested offer of this quote", () => {
    process.env.DEMO_MODE = "true";
    expect(demoFailureOfferId([flight, late, early])).toBe("activity-2-a");
    expect(demoFailureOfferId([flight, late, early], "activity-3-b")).toBe("activity-3-b");
    expect(demoFailureOfferId([flight, late, early], "not-in-this-quote")).toBe("activity-2-a");
    expect(demoFailureOfferId([flight, hotel])).toBeUndefined();
    delete process.env.DEMO_MODE;
  });
});
