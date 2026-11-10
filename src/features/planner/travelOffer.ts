import { z } from "zod";
import { minorUnits, zonedDateTime, type MinorUnits, type ZonedDateTime } from "./types";

export type TravelOffer = {
  id: string;
  supplier: string;
  supplierRef: string;
  productKind: "flight" | "hotel" | "activity";
  title: string;
  summary: string;
  startsAt: ZonedDateTime;
  endsAt: ZonedDateTime;
  costMinorUnits: MinorUnits;
  currency: "USD";
  retrievedAt: string;
  expiresAt: string;
  cancellationTerms: string | null;
  synthetic: boolean;
  /**
   * Set only for an Onboarded Supplier (GLOSSARY.md): the Trip Order pays this
   * PayPal account directly as its own purchase unit instead of summing into
   * Tripweave's bundle unit. See docs/adr/0002-multi-payee-orders-pay-suppliers-directly.md.
   */
  supplierPayeeEmail?: string;
  /**
   * The same real-world product across platforms, set by the adapter when it
   * can identify it (e.g. `flight:AA123@2026-12-10T06:58`). Offers that share
   * it are compared on price. Offers without one are never merged.
   */
  productKey?: string;
  /**
   * The market this offer competes in, e.g. `flight-market:SFO-LIS@2026-12-20`:
   * different products a traveller could swap for each other. Used to compare
   * against metasearch fares that can't be matched to the exact flight.
   */
  marketKey?: string;
  /** The supplier's own public page for this offer (a deeplink offer's only way to buy it). */
  listingUrl?: string;
};

export type OfferViolation =
  | { kind: "over-budget"; totalCostMinorUnits: MinorUnits; budgetMinorUnits: MinorUnits }
  | { kind: "outside-trip-window"; offerId: string }
  | { kind: "invalid-time-range"; offerId: string }
  | { kind: "schedule-conflict"; firstOfferId: string; secondOfferId: string };

export type DayPlan = {
  date: string;
  offers: TravelOffer[];
  subtotalMinorUnits: MinorUnits;
};

export type CategoryBudget = {
  productKind: TravelOffer["productKind"];
  subtotalMinorUnits: MinorUnits;
};

export type ItineraryPlan = {
  offers: TravelOffer[];
  totalCostMinorUnits: MinorUnits;
  status: "feasible" | "infeasible";
  budgetRemainingMinorUnits: MinorUnits | null;
  violations: OfferViolation[];
  days: DayPlan[];
  budgetByCategory: CategoryBudget[];
};

export const travelOfferSchema = z
  .object({
    id: z.string(),
    supplier: z.string(),
    supplierRef: z.string(),
    productKind: z.enum(["flight", "hotel", "activity"]),
    title: z.string(),
    summary: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    costMinorUnits: z.number().int().nonnegative(),
    currency: z.literal("USD"),
    retrievedAt: z.string(),
    expiresAt: z.string(),
    cancellationTerms: z.string().nullable(),
    synthetic: z.boolean(),
    supplierPayeeEmail: z.string().email().optional(),
    productKey: z.string().min(1).max(200).optional(),
    marketKey: z.string().min(1).max(200).optional(),
    listingUrl: z.string().url().refine((url) => url.startsWith("https://"), "Listing links must be https.").optional(),
  })
  // A flight is never a legitimate Onboarded Supplier (GLOSSARY.md): airline
  // ticketing settles via IATA's Billing and Settlement Plan, not through any
  // buyer-side payment processor, independent of what PayPal itself allows.
  // Enforced at the schema so every entry point (both payment routes) gets it
  // for free, not just the one UI control that happens to filter it today.
  .refine((offer) => !(offer.productKind === "flight" && offer.supplierPayeeEmail), {
    message: "A flight cannot have a direct supplier payee.",
    path: ["supplierPayeeEmail"],
  });

export type TravelOfferView = z.infer<typeof travelOfferSchema>;

/** Parses a wire-shaped offer into the branded domain type. Pure; the schema above is the boundary. */
export function toTravelOffer(view: TravelOfferView): TravelOffer {
  return {
    ...view,
    startsAt: zonedDateTime(view.startsAt),
    endsAt: zonedDateTime(view.endsAt),
    costMinorUnits: minorUnits(view.costMinorUnits),
  };
}
export type ItineraryPlanView = z.infer<typeof itineraryPlanSchema>;
export type DayPlanView = z.infer<typeof dayPlanSchema>;
export type CategoryBudgetView = z.infer<typeof categoryBudgetSchema>;

export const dayPlanSchema = z.object({
  date: z.string(),
  offers: z.array(travelOfferSchema),
  subtotalMinorUnits: z.number().int().nonnegative(),
});

export const categoryBudgetSchema = z.object({
  productKind: z.enum(["flight", "hotel", "activity"]),
  subtotalMinorUnits: z.number().int().nonnegative(),
});

export const itineraryPlanSchema = z.object({
  offers: z.array(travelOfferSchema),
  totalCostMinorUnits: z.number().int().nonnegative(),
  status: z.enum(["feasible", "infeasible"]),
  budgetRemainingMinorUnits: z.number().int().nonnegative().nullable(),
  violations: z.array(
    z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("over-budget"),
        totalCostMinorUnits: z.number().int(),
        budgetMinorUnits: z.number().int(),
      }),
      z.object({ kind: z.literal("outside-trip-window"), offerId: z.string() }),
      z.object({ kind: z.literal("invalid-time-range"), offerId: z.string() }),
      z.object({
        kind: z.literal("schedule-conflict"),
        firstOfferId: z.string(),
        secondOfferId: z.string(),
      }),
    ]),
  ),
  days: z.array(dayPlanSchema),
  budgetByCategory: z.array(categoryBudgetSchema),
});
