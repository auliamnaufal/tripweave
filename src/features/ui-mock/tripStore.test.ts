import { describe, expect, it } from "vitest";
import { tripPaidFor, type Order } from "./tripStore";

const order = (destId: string, total: number): Order => ({ id: "o1", title: "Trip", destId, total, at: "", items: 1 });

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
