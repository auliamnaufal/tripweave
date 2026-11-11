import { describe, expect, it } from "vitest";
import { mergeTripRows, tripPaidFor, type Order, type TripHistoryEntry } from "./tripStore";

const order = (destId: string, total: number, id = "o1"): Order => ({ id, title: "Trip", destId, total, at: "2026-02-01", items: 1 });
const hist = (destId: string, id = "h1"): TripHistoryEntry => ({ id, title: `${destId} plan`, destId, at: "2026-01-01" });

describe("tripPaidFor", () => {
  it("is true once an order matches the plan's destination and total", () => {
    expect(tripPaidFor([order("kyoto", 2400)], "kyoto", 2400)).toBe(true);
  });

  it("is false for a different destination or a different total", () => {
    expect(tripPaidFor([order("kyoto", 2400)], "lisbon", 2400)).toBe(false);
    expect(tripPaidFor([order("kyoto", 2400)], "kyoto", 2500)).toBe(false);
    expect(tripPaidFor([], "kyoto", 2400)).toBe(false);
  });
});

describe("mergeTripRows", () => {
  it("keeps separate trips to different destinations separate, each correctly paid or not", () => {
    const rows = mergeTripRows([hist("kyoto", "h-kyoto"), hist("sfo", "h-sfo")], [order("kyoto", 2400, "o-kyoto")]);
    expect(rows).toHaveLength(2);
    const kyoto = rows.find((r) => r.destId === "kyoto")!;
    const sfo = rows.find((r) => r.destId === "sfo")!;
    expect(kyoto).toMatchObject({ paid: true, orderId: "o-kyoto", tripId: "h-kyoto" });
    expect(sfo).toMatchObject({ paid: false, orderId: null, tripId: "h-sfo" });
  });

  it("still surfaces an order with no matching history row, just without a resumable trip id", () => {
    const rows = mergeTripRows([], [order("kyoto", 2400, "o-kyoto")]);
    expect(rows).toEqual([{ key: "o-kyoto", tripId: null, title: "Trip", destId: "kyoto", at: "2026-02-01", paid: true, orderId: "o-kyoto", total: 2400 }]);
  });

  it("never pairs one order to two history rows for the same destination", () => {
    const rows = mergeTripRows([hist("kyoto", "h1"), hist("kyoto", "h2")], [order("kyoto", 2400, "o1")]);
    expect(rows.filter((r) => r.paid)).toHaveLength(1);
    expect(rows.filter((r) => !r.paid)).toHaveLength(1);
  });
});
