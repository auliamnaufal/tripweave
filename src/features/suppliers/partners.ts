import type { TravelOffer } from "@/features/planner/travelOffer";
import { minorUnits } from "@/features/planner/types";
import type { ProductKind, RepriceResult, SupplierAdapter } from "./adapter";
import { simulateBooking } from "./booking";

// Simulated OTA partners. Each resells the same real inventory the primary
// sources return (Duffel fares, LiteAPI rooms, local activities), the way
// Traveloka or tiket.com resell airline and hotel inventory, but at its own
// price and terms. Prices are deterministic per product, so a demo is
// repeatable and the comparison is product-for-product. Swapping one of these
// for a real partner's B2B API changes only this file.

type Pricing = { min: number; max: number; terms: string };

export type PartnerProfile = {
  name: string;
  /** Short code used in offer ids. */
  code: string;
  pricing: Partial<Record<ProductKind, Pricing>>;
  /** Share of products this partner doesn't carry, 0–1. */
  missingShare: number;
};

export const PARTNER_PROFILES: PartnerProfile[] = [
  {
    name: "nusantara-trips",
    code: "nt",
    pricing: {
      flight: { min: 0.95, max: 1.07, terms: "Non-refundable. Includes one checked bag." },
      hotel: { min: 0.88, max: 1.03, terms: "Non-refundable member rate." },
      activity: { min: 0.96, max: 1.08, terms: "Free cancellation up to 24 hours before." },
    },
    missingShare: 0.1,
  },
  {
    name: "skybazaar",
    code: "sb",
    pricing: {
      flight: { min: 0.93, max: 1.05, terms: "Non-refundable. Cabin bag only." },
      hotel: { min: 0.97, max: 1.12, terms: "Free cancellation up to 48 hours before check-in." },
      activity: { min: 0.9, max: 1.06, terms: "Non-refundable." },
    },
    missingShare: 0.25,
  },
];

/** FNV-1a: a stable 0–1 number per (partner, product), so prices repeat run to run. */
function unit(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0xffffffff;
}

function factorFor(profile: PartnerProfile, productKey: string, pricing: Pricing): number {
  return pricing.min + (pricing.max - pricing.min) * unit(`${profile.name}|price|${productKey}`);
}

const SEP = "|";

function encodeRef(profile: PartnerProfile, base: TravelOffer): string {
  return [profile.name, base.supplier, base.id, base.supplierRef].join(SEP);
}

function decodeRef(offer: TravelOffer): { baseSupplier: string; baseId: string; baseRef: string } {
  const [, baseSupplier, baseId, ...rest] = offer.supplierRef.split(SEP);
  if (!baseSupplier || !baseId || rest.length === 0) throw new Error(`Offer ${offer.id} has no partner reference.`);
  return { baseSupplier, baseId, baseRef: rest.join(SEP) };
}

export function resell(profile: PartnerProfile, base: TravelOffer): TravelOffer | null {
  const pricing = profile.pricing[base.productKind];
  if (!pricing || !base.productKey || base.supplierPayeeEmail) return null;
  if (unit(`${profile.name}|stock|${base.productKey}`) < profile.missingShare) return null;
  const factor = factorFor(profile, base.productKey, pricing);
  return {
    ...base,
    id: `${base.productKind}-${profile.code}-${base.id.slice(base.productKind.length + 1)}`,
    supplier: profile.name,
    supplierRef: encodeRef(profile, base),
    costMinorUnits: minorUnits(Math.round(base.costMinorUnits * factor)),
    cancellationTerms: pricing.terms,
    synthetic: true,
    listingUrl: undefined,
  };
}

/**
 * A simulated partner over the given base sources (one per kind). `bases`
 * should be the same memoized adapters the registry uses, so a plan searches
 * each real source once however many partners resell it.
 */
export function createPartnerAdapter(profile: PartnerProfile, bases: Partial<Record<ProductKind, SupplierAdapter>>): SupplierAdapter {
  const kinds = (Object.keys(profile.pricing) as ProductKind[]).filter((kind) => bases[kind]);
  return {
    name: profile.name,
    kinds,
    capability: "bookable",
    isConfigured: () => kinds.some((kind) => bases[kind]?.isConfigured()),
    async search(brief, kind) {
      const base = bases[kind];
      if (!base?.isConfigured()) return [];
      const offers = await base.search(brief, kind);
      return offers.map((offer) => resell(profile, offer)).filter((offer): offer is TravelOffer => offer !== null);
    },
    async reprice(offer): Promise<RepriceResult> {
      const pricing = profile.pricing[offer.productKind];
      const base = bases[offer.productKind];
      if (!pricing || !base || !offer.productKey) return { status: "unavailable", reason: "This partner no longer sells this item." };
      const { baseSupplier, baseId, baseRef } = decodeRef(offer);
      // The partner's price follows its source: re-check the source, keep the partner's margin.
      // Ask the source about its own price, not the partner's: a source whose
      // prices never move echoes back what it was given, and multiplying the
      // partner's price by the margin again compounded it on every reprice,
      // so checkout never settled on a total.
      const factor = factorFor(profile, offer.productKey, pricing);
      const baseCostMinorUnits = minorUnits(Math.round(offer.costMinorUnits / factor));
      const checked = await base.reprice({
        ...offer,
        id: baseId,
        supplier: baseSupplier,
        supplierRef: baseRef,
        costMinorUnits: baseCostMinorUnits,
      });
      if (checked.status === "unavailable") return checked;
      const costMinorUnits =
        checked.status === "unchanged"
          ? offer.costMinorUnits
          : minorUnits(Math.round(checked.offer.costMinorUnits * factor));
      const supplierRef = [profile.name, baseSupplier, baseId, checked.offer.supplierRef].join(SEP);
      const updated: TravelOffer = { ...offer, supplierRef, costMinorUnits, retrievedAt: checked.offer.retrievedAt, expiresAt: checked.offer.expiresAt };
      return costMinorUnits === offer.costMinorUnits && supplierRef === offer.supplierRef
        ? { status: "unchanged", offer: updated }
        : { status: "changed", offer: updated, previousMinorUnits: offer.costMinorUnits };
    },
    // ponytail: simulated. A real partner books through its B2B API here,
    // passing context.idempotencyKey as its own booking reference.
    book: async (offer, context) => simulateBooking(offer, context.forceFail === true),
  };
}
