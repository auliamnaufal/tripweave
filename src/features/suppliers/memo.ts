import type { TripBrief } from "@/features/planner/tripBrief";
import type { TravelOffer } from "@/features/planner/travelOffer";
import type { ProductKind, SupplierAdapter } from "./adapter";

type Entry = { at: number; promise: Promise<TravelOffer[]> };

/**
 * Shares one in-flight search between every caller for the same brief and
 * kind for a short while. Partner adapters resell the same airline and hotel
 * inventory the primary sources return, so without this one plan would hit
 * Duffel or LiteAPI once per partner.
 */
export function memoizeSearch(adapter: SupplierAdapter, ttlMs = 120_000): SupplierAdapter {
  const cache = new Map<string, Entry>();
  return {
    ...adapter,
    isConfigured: () => adapter.isConfigured(),
    search(brief: TripBrief, kind: ProductKind) {
      const key = `${kind}:${JSON.stringify(brief)}`;
      const now = Date.now();
      for (const [k, entry] of cache) if (now - entry.at > ttlMs) cache.delete(k);
      const hit = cache.get(key);
      if (hit) return hit.promise;
      const promise = adapter.search(brief, kind);
      // A failed search must not be served from cache to the next caller.
      promise.catch(() => cache.delete(key));
      cache.set(key, { at: now, promise });
      return promise;
    },
  };
}
