import { z } from "zod";
import type { MinorUnits, ZonedDateTime } from "./types";

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

export const travelOfferSchema = z.object({
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
});

export type TravelOfferView = z.infer<typeof travelOfferSchema>;
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
