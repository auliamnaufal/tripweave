import type { TripBrief } from "@/features/planner/tripBrief";
import { toTravelOffer, travelOfferSchema, type TravelOffer } from "@/features/planner/travelOffer";
import type { BookingContext, ProductKind, RepriceResult, SupplierAdapter } from "./adapter";
import type { BookingResult } from "./booking";
import { compareOffers, marketBenchmarks, type MarketBenchmark, type ProductComparison } from "./compare";
import { duffelAdapter } from "./duffel";
import { liteApiAdapter } from "./liteapi";
import { memoizeSearch } from "./memo";
import { createPartnerAdapter, PARTNER_PROFILES } from "./partners";
import { syntheticAdapter } from "./synthetic";
import { travelpayoutsAdapter } from "./travelpayouts";

// One instance of each source for the process, so the memoized search is
// shared between a source and every partner that resells its inventory.
const duffel = memoizeSearch(duffelAdapter);
const liteapi = memoizeSearch(liteApiAdapter);
const synthetic = memoizeSearch(syntheticAdapter);

/** Real hotel inventory when LiteAPI is configured, sample stays otherwise. */
const hotelSource = (): SupplierAdapter => (liteapi.isConfigured() ? liteapi : synthetic);
const hotelBase: SupplierAdapter = {
  get name() {
    return hotelSource().name;
  },
  kinds: ["hotel"],
  capability: "bookable",
  isConfigured: () => hotelSource().isConfigured(),
  search: (brief, kind) => hotelSource().search(brief, kind),
  reprice: (offer) => hotelSource().reprice(offer),
  book: (offer, context) => hotelSource().book(offer, context),
};

const partners = PARTNER_PROFILES.map((profile) =>
  createPartnerAdapter(profile, { flight: duffel, hotel: hotelBase, activity: synthetic }),
);

/**
 * Which adapters serve each product kind. `primary` adapters are searched in
 * parallel; `fallback` ones only when every primary returned nothing (failed,
 * timed out, not configured, or empty). A kind marked `required` with no
 * offers at all fails the whole search, so a plan is never built without flights.
 */
export type KindRoute = { primary: SupplierAdapter[]; fallback: SupplierAdapter[]; required: boolean };
export type RegistryConfig = { routes: Record<ProductKind, KindRoute>; timeoutMs: number };

/**
 * Every platform Tripweave searches, per kind:
 * - flights: Duffel (real fares) + simulated OTA partners reselling them +
 *   Aviasales via Travelpayouts (real market fares, price check only).
 *   Never a silent swap to sample flights.
 * - hotels: LiteAPI (real, sandbox-bookable) + partners; sample stays only
 *   as a fallback, or as the source when LiteAPI isn't configured.
 * - activities: local operators (sample catalog) + partners.
 */
export function defaultRegistryConfig(): RegistryConfig {
  const realHotels = liteapi.isConfigured();
  return {
    routes: {
      flight: { primary: [duffel, ...partners, travelpayoutsAdapter], fallback: [], required: true },
      hotel: { primary: [realHotels ? liteapi : synthetic, ...partners], fallback: realHotels ? [synthetic] : [], required: false },
      activity: { primary: [synthetic, ...partners], fallback: [], required: false },
    },
    timeoutMs: 25_000,
  };
}

export type SourceReport = {
  supplier: string;
  kind: ProductKind;
  status: "ok" | "empty" | "failed" | "timeout" | "not-configured";
  offers: number;
  /** Offers dropped for breaking the adapter contract. */
  rejected: number;
  fallback: boolean;
  capability: SupplierAdapter["capability"];
};

export type CatalogResult = {
  /** Bookable offers only, best deal per product. The planner and PayPal see nothing else. */
  offers: TravelOffer[];
  /** The same product priced on two or more platforms, including deeplink-only ones. */
  comparisons: ProductComparison[];
  /** Per flight market (route + day): best bookable fare vs. metasearch fares that day and nearby. */
  markets: MarketBenchmark[];
  sources: SourceReport[];
};

export class CatalogUnavailableError extends Error {
  constructor(readonly kind: ProductKind) {
    super(`No ${kind} offers are available for this trip right now.`);
  }
}

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError()), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * The adapter contract, enforced: anything that isn't a valid TravelOffer of
 * the right kind from the right supplier is dropped, never passed upward.
 */
function acceptOffers(adapter: SupplierAdapter, kind: ProductKind, raw: unknown[]): { offers: TravelOffer[]; rejected: number } {
  const offers: TravelOffer[] = [];
  let rejected = 0;
  for (const item of raw) {
    const parsed = travelOfferSchema.safeParse(item);
    if (
      !parsed.success ||
      parsed.data.productKind !== kind ||
      parsed.data.supplier !== adapter.name ||
      // A deeplink offer is useless without the page to buy it on, and can
      // never carry a payee: Tripweave doesn't take money for it.
      (adapter.capability === "deeplink" && (!parsed.data.listingUrl || parsed.data.supplierPayeeEmail))
    ) {
      rejected += 1;
      continue;
    }
    offers.push(toTravelOffer(parsed.data));
  }
  return { offers, rejected };
}

async function searchOne(
  adapter: SupplierAdapter,
  brief: TripBrief,
  kind: ProductKind,
  timeoutMs: number,
  fallback: boolean,
): Promise<{ offers: TravelOffer[]; report: SourceReport }> {
  const base = { supplier: adapter.name, kind, fallback, offers: 0, rejected: 0, capability: adapter.capability };
  if (!adapter.isConfigured()) return { offers: [], report: { ...base, status: "not-configured" } };
  try {
    const raw = await withTimeout(adapter.search(brief, kind), timeoutMs);
    const { offers, rejected } = acceptOffers(adapter, kind, raw);
    if (rejected > 0) console.warn(`supplier ${adapter.name} returned ${rejected} invalid ${kind} offer(s)`);
    return { offers, report: { ...base, status: offers.length ? "ok" : "empty", offers: offers.length, rejected } };
  } catch (error) {
    const timedOut = error instanceof TimeoutError;
    console.error(`supplier ${adapter.name} ${kind} search ${timedOut ? "timed out" : "failed"}`, timedOut ? "" : error);
    return { offers: [], report: { ...base, status: timedOut ? "timeout" : "failed" } };
  }
}

async function searchKind(
  brief: TripBrief,
  kind: ProductKind,
  route: KindRoute,
  timeoutMs: number,
): Promise<{ bookable: TravelOffer[]; deeplink: TravelOffer[]; sources: SourceReport[] }> {
  const primary = await Promise.all(route.primary.map((adapter) => searchOne(adapter, brief, kind, timeoutMs, false)));
  let results = primary;
  // Fallback is for when nothing bookable came back. Deeplink prices alone
  // can't be paid for, so they don't count as an answer.
  const anyBookable = primary.some((result) => result.report.capability === "bookable" && result.offers.length > 0);
  if (!anyBookable && route.fallback.length > 0) {
    const fallback = await Promise.all(route.fallback.map((adapter) => searchOne(adapter, brief, kind, timeoutMs, true)));
    results = [...primary, ...fallback];
  }
  const of = (capability: SupplierAdapter["capability"]) =>
    results.filter((result) => result.report.capability === capability).flatMap((result) => result.offers);
  return { bookable: of("bookable"), deeplink: of("deeplink"), sources: results.map((result) => result.report) };
}

/** Two suppliers must never collide on an id: the id is what gets paid for. */
function uniqueIds(offers: readonly TravelOffer[], seen: Set<string>): TravelOffer[] {
  return offers.filter((offer) => {
    if (seen.has(offer.id)) {
      console.warn(`duplicate offer id ${offer.id} from ${offer.supplier} dropped`);
      return false;
    }
    seen.add(offer.id);
    return true;
  });
}

/**
 * Searches every product kind once, on every configured platform, then keeps
 * the best bookable deal per product (see `compareOffers`). This one catalog
 * is what the agent picks from and what the server rebuilds the plan from, so
 * both always see the same ids and prices.
 */
export async function searchCatalog(brief: TripBrief, config: RegistryConfig = defaultRegistryConfig()): Promise<CatalogResult> {
  const kinds = Object.keys(config.routes) as ProductKind[];
  const perKind = await Promise.all(kinds.map((kind) => searchKind(brief, kind, config.routes[kind], config.timeoutMs)));

  const seen = new Set<string>();
  const offers: TravelOffer[] = [];
  const comparisons: ProductComparison[] = [];
  const markets: MarketBenchmark[] = [];
  perKind.forEach((result, index) => {
    const kind = kinds[index];
    const bookable = uniqueIds(result.bookable, seen);
    const deeplink = uniqueIds(result.deeplink, seen);
    const compared = compareOffers(bookable, deeplink);
    if (compared.catalog.length === 0 && config.routes[kind].required) throw new CatalogUnavailableError(kind);
    offers.push(...compared.catalog);
    comparisons.push(...compared.comparisons);
    markets.push(...marketBenchmarks(bookable, deeplink));
  });
  return { offers, comparisons, markets, sources: perKind.flatMap((result) => result.sources) };
}

function allAdapters(config: RegistryConfig): SupplierAdapter[] {
  const byName = new Map<string, SupplierAdapter>();
  for (const route of Object.values(config.routes)) {
    for (const adapter of [...route.primary, ...route.fallback]) byName.set(adapter.name, adapter);
  }
  return [...byName.values()];
}

/** Routes an offer back to the adapter that produced it. */
export function adapterFor(offer: TravelOffer, config: RegistryConfig = defaultRegistryConfig()): SupplierAdapter {
  const adapter = allAdapters(config).find((candidate) => candidate.name === offer.supplier);
  if (!adapter || !adapter.kinds.includes(offer.productKind)) {
    throw new Error(`No supplier adapter can handle ${offer.productKind} offers from "${offer.supplier}".`);
  }
  return adapter;
}

/** The adapter for an offer Tripweave is about to charge for or book. Deeplink-only sources are refused. */
export function bookableAdapterFor(offer: TravelOffer, config?: RegistryConfig): SupplierAdapter {
  const adapter = adapterFor(offer, config);
  if (adapter.capability !== "bookable") {
    throw new Error(`"${offer.supplier}" is a price-comparison source; its offers can't be paid for or booked here.`);
  }
  return adapter;
}

/** Throws unless every offer can be charged through PayPal and booked by Tripweave. */
export function assertBookable(offers: readonly TravelOffer[], config?: RegistryConfig): void {
  for (const offer of offers) bookableAdapterFor(offer, config);
}

export function repriceOffer(offer: TravelOffer, config?: RegistryConfig): Promise<RepriceResult> {
  return bookableAdapterFor(offer, config).reprice(offer);
}

export function bookOffer(
  offer: TravelOffer,
  context: BookingContext,
  config?: RegistryConfig,
): Promise<BookingResult> {
  return bookableAdapterFor(offer, config).book(offer, context);
}
