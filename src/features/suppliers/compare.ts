import type { TravelOffer } from "@/features/planner/travelOffer";
import type { ProductKind } from "./adapter";

/** One platform's price for a product. */
export type PriceOption = {
  supplier: string;
  offerId: string;
  costMinorUnits: number;
  bookable: boolean;
  listingUrl?: string;
  cancellationTerms: string | null;
};

/**
 * Every platform's price for the same real-world product, cheapest first.
 * `cheaperElsewhereMinorUnits` > 0 means a deeplink-only platform beats every
 * price Tripweave can book itself — shown to the traveller, never charged.
 */
export type ProductComparison = {
  productKey: string;
  kind: ProductKind;
  title: string;
  options: PriceOption[];
  bestBookable: PriceOption | null;
  cheapest: PriceOption;
  cheaperElsewhereMinorUnits: number;
};

export type ComparisonResult = {
  /** What the planner may choose from and PayPal may charge for: bookable only. */
  catalog: TravelOffer[];
  /** Only products seen on two or more platforms. */
  comparisons: ProductComparison[];
};

function option(offer: TravelOffer, bookable: boolean): PriceOption {
  return {
    supplier: offer.supplier,
    offerId: offer.id,
    costMinorUnits: offer.costMinorUnits,
    bookable,
    ...(offer.listingUrl ? { listingUrl: offer.listingUrl } : {}),
    cancellationTerms: offer.cancellationTerms,
  };
}

const byPrice = (a: PriceOption, b: PriceOption) => a.costMinorUnits - b.costMinorUnits || a.supplier.localeCompare(b.supplier);

/**
 * Compares the same product across platforms and keeps the best bookable deal.
 *
 * - Offers are grouped by `productKey`. Offers without one are kept as is and
 *   never merged: a wrong match would charge for the wrong product.
 * - Within a group, the catalog keeps every bookable offer of the one supplier
 *   with the cheapest bookable price (its other fares stay available, e.g. a
 *   refundable one), and drops the same product from pricier suppliers.
 * - Deeplink offers never enter the catalog; they only appear in comparisons.
 *
 * Prices are compared as totals for the whole party in USD minor units, which
 * every adapter already produces at its boundary.
 */
export function compareOffers(bookable: readonly TravelOffer[], deeplink: readonly TravelOffer[] = []): ComparisonResult {
  const groups = new Map<string, { bookable: TravelOffer[]; deeplink: TravelOffer[] }>();
  const catalog: TravelOffer[] = [];

  for (const offer of bookable) {
    if (!offer.productKey) {
      catalog.push(offer);
      continue;
    }
    const group = groups.get(offer.productKey) ?? { bookable: [], deeplink: [] };
    group.bookable.push(offer);
    groups.set(offer.productKey, group);
  }
  for (const offer of deeplink) {
    if (!offer.productKey) continue;
    const group = groups.get(offer.productKey) ?? { bookable: [], deeplink: [] };
    group.deeplink.push(offer);
    groups.set(offer.productKey, group);
  }

  const comparisons: ProductComparison[] = [];
  for (const [productKey, group] of groups) {
    const bookableOptions = group.bookable.map((offer) => option(offer, true)).sort(byPrice);
    const bestBookable = bookableOptions[0] ?? null;
    if (bestBookable) {
      catalog.push(...group.bookable.filter((offer) => offer.supplier === bestBookable.supplier));
    }

    const options = [...bookableOptions, ...group.deeplink.map((offer) => option(offer, false))].sort(byPrice);
    const suppliers = new Set(options.map((item) => item.supplier));
    if (suppliers.size < 2) continue;
    const reference = group.bookable[0] ?? group.deeplink[0];
    const cheapest = options[0];
    comparisons.push({
      productKey,
      kind: reference.productKind,
      title: reference.title,
      options,
      bestBookable,
      cheapest,
      cheaperElsewhereMinorUnits: bestBookable && !cheapest.bookable ? bestBookable.costMinorUnits - cheapest.costMinorUnits : 0,
    });
  }

  return { catalog, comparisons };
}

/** The comparisons that matter for one plan: products it actually contains. */
export function comparisonsFor(offers: readonly TravelOffer[], comparisons: readonly ProductComparison[]): ProductComparison[] {
  const keys = new Set(offers.map((offer) => offer.productKey).filter(Boolean));
  return comparisons.filter((comparison) => keys.has(comparison.productKey));
}
