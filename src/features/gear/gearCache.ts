// The gear kit depends only on the quote, and each build costs one model call
// plus up to four Channel3 searches. Caching it per quote means "Try again", a
// reload or a script against a known quote id doesn't spend credits again.
// In-memory and per process: enough for one demo server, and a miss only costs
// a rebuild.

const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 200;

type Entry<T> = { at: number; value: Promise<T> };

export function createKitCache<T>(options: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}) {
  const ttl = options.ttlMs ?? TTL_MS;
  const max = options.maxEntries ?? MAX_ENTRIES;
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry<T>>();

  return {
    /**
     * The cached kit for `key`, or `build()`'s. Concurrent callers share one
     * in-flight build; a failed build is dropped so the next call retries.
     */
    get(key: string, build: () => Promise<T>): Promise<T> {
      const hit = entries.get(key);
      if (hit && now() - hit.at < ttl) return hit.value;
      const value = build();
      entries.set(key, { at: now(), value });
      value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key);
      });
      // Map keeps insertion order, so the first key is the oldest.
      while (entries.size > max) entries.delete(entries.keys().next().value as string);
      return value;
    },
  };
}

/** A key that changes whenever the quote's priced contents do (e.g. an option was swapped). */
export function gearCacheKey(quote: { id: string; totalMinorUnits: number; offers: readonly { id: string }[] }): string {
  return `${quote.id}:${quote.totalMinorUnits}:${quote.offers.map((offer) => offer.id).join(",")}`;
}
