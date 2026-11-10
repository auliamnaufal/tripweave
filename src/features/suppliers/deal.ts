import type { TravelOffer } from "@/features/planner/travelOffer";
import { comparisonsFor, type MarketBenchmark, type PriceOption, type ProductComparison } from "./compare";
import { platformInfo } from "./platforms";
import type { SourceReport } from "./registry";

/**
 * What the deal hunt found for one plan, computed by code from the search
 * itself (never from the model's note), so the UI can show it as fact.
 */
export type DealSummary = {
  platforms: { supplier: string; label: string; data: "live" | "simulated"; role: "bookable" | "deeplink"; offers: number; status: SourceReport["status"] }[];
  offersCompared: number;
  items: {
    offerId: string;
    title: string;
    kind: TravelOffer["productKind"];
    chosen: { supplier: string; label: string; costMinorUnits: number };
    platformsCompared: number;
    highestMinorUnits: number;
    savedMinorUnits: number;
  }[];
  savedMinorUnits: number;
  /** "Fly on X instead and the market fare is $Y less" tips, from metasearch data. */
  tips: { route: string; date: string; betterDate: string; marketFareMinorUnits: number; bookableMinorUnits: number; listingUrl?: string; source: string }[];
  /** Metasearch fares cheaper than anything bookable on the same day. */
  cheaperElsewhere: { route: string; date: string; fare: PriceOption; bookableMinorUnits: number }[];
};

export function summarizeDeal(
  planOffers: readonly TravelOffer[],
  comparisons: readonly ProductComparison[],
  markets: readonly MarketBenchmark[],
  sources: readonly SourceReport[],
): DealSummary {
  const bySupplier = new Map<string, DealSummary["platforms"][number]>();
  for (const source of sources) {
    const info = platformInfo(source.supplier);
    const current = bySupplier.get(source.supplier);
    const status = current?.status === "ok" || source.status === "ok" ? "ok" : source.status;
    bySupplier.set(source.supplier, {
      supplier: source.supplier,
      label: info.label,
      data: info.data,
      role: info.role,
      offers: (current?.offers ?? 0) + source.offers,
      status,
    });
  }

  const relevant = comparisonsFor(planOffers, comparisons);
  const byKey = new Map(relevant.map((comparison) => [comparison.productKey, comparison]));
  const items = planOffers.map((offer) => {
    const comparison = offer.productKey ? byKey.get(offer.productKey) : undefined;
    const bookablePrices = comparison?.options.filter((item) => item.bookable).map((item) => item.costMinorUnits) ?? [];
    const highest = Math.max(offer.costMinorUnits, ...bookablePrices);
    return {
      offerId: offer.id,
      title: offer.title,
      kind: offer.productKind,
      chosen: { supplier: offer.supplier, label: platformInfo(offer.supplier).label, costMinorUnits: offer.costMinorUnits },
      platformsCompared: comparison ? new Set(comparison.options.map((item) => item.supplier)).size : 1,
      highestMinorUnits: highest,
      savedMinorUnits: highest - offer.costMinorUnits,
    };
  });

  const planMarkets = new Set(planOffers.map((offer) => offer.marketKey).filter(Boolean));
  const tips: DealSummary["tips"] = [];
  const cheaperElsewhere: DealSummary["cheaperElsewhere"] = [];
  for (const market of markets) {
    if (!planMarkets.has(market.marketKey) || !market.bestBookable) continue;
    const bookable = market.bestBookable.costMinorUnits;
    // Only a real saving is worth a tip: at least 10% and $20 below today's best bookable fare.
    if (market.nearby && market.nearby.costMinorUnits < bookable * 0.9 && bookable - market.nearby.costMinorUnits >= 2000) {
      tips.push({
        route: market.route,
        date: market.date,
        betterDate: market.nearby.date,
        marketFareMinorUnits: market.nearby.costMinorUnits,
        bookableMinorUnits: bookable,
        ...(market.nearby.listingUrl ? { listingUrl: market.nearby.listingUrl } : {}),
        source: platformInfo(market.nearby.supplier).label,
      });
    }
    if (market.sameDay && market.sameDay.costMinorUnits < bookable) {
      cheaperElsewhere.push({ route: market.route, date: market.date, fare: market.sameDay, bookableMinorUnits: bookable });
    }
  }

  return {
    platforms: [...bySupplier.values()],
    offersCompared: sources.reduce((sum, source) => sum + source.offers, 0),
    items,
    savedMinorUnits: items.reduce((sum, item) => sum + item.savedMinorUnits, 0),
    tips,
    cheaperElsewhere,
  };
}
