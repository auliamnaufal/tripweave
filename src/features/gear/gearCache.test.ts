import { describe, expect, it, vi } from "vitest";
import { createKitCache, gearCacheKey } from "./gearCache";

describe("gear kit cache", () => {
  it("builds once per key, sharing an in-flight build", async () => {
    const cache = createKitCache<string>();
    const build = vi.fn(async () => "kit");
    const [a, b] = await Promise.all([cache.get("q1", build), cache.get("q1", build)]);
    expect([a, b, await cache.get("q1", build)]).toEqual(["kit", "kit", "kit"]);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed build instead of caching the failure", async () => {
    const cache = createKitCache<string>();
    await expect(cache.get("q1", async () => Promise.reject(new Error("down")))).rejects.toThrow("down");
    await Promise.resolve();
    expect(await cache.get("q1", async () => "kit")).toBe("kit");
  });

  it("rebuilds once the entry is older than the TTL, and evicts the oldest past the size cap", async () => {
    let clock = 0;
    const cache = createKitCache<string>({ ttlMs: 1000, maxEntries: 2, now: () => clock });
    const build = vi.fn(async () => "kit");
    await cache.get("q1", build);
    clock = 1500;
    await cache.get("q1", build);
    expect(build).toHaveBeenCalledTimes(2);

    await cache.get("q2", build);
    await cache.get("q3", build); // evicts q1
    await cache.get("q1", build);
    expect(build).toHaveBeenCalledTimes(5);
  });

  it("keys on the quote's priced contents, so a swapped option rebuilds", () => {
    const quote = { id: "q", totalMinorUnits: 1000, offers: [{ id: "a" }, { id: "b" }] };
    expect(gearCacheKey(quote)).not.toBe(gearCacheKey({ ...quote, offers: [{ id: "a" }, { id: "c" }] }));
    expect(gearCacheKey(quote)).not.toBe(gearCacheKey({ ...quote, totalMinorUnits: 1200 }));
  });
});
