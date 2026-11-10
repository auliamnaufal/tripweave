import { describe, expect, it } from "vitest";
import { needsAccount } from "./proxy";

describe("needsAccount", () => {
  it("guards every app page, including nested paths", () => {
    for (const path of ["/plan", "/trip", "/checkout", "/booked", "/account", "/tickets", "/account/anything"]) {
      expect(needsAccount(path)).toBe(true);
    }
  });

  it("leaves the landing page, sign-in, PayPal's return page and APIs open", () => {
    for (const path of ["/", "/login", "/legal", "/checkout/return", "/api/plan", "/api/webhooks/paypal", "/planet"]) {
      expect(needsAccount(path)).toBe(false);
    }
  });
});
