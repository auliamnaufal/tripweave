import { z } from "zod";
import { minorUnits, zonedDateTime, type MinorUnits, type ZonedDateTime } from "./types";

const zonedDateTimeSchema = z.string().refine((value) => {
  try {
    zonedDateTime(value);
    return true;
  } catch {
    return false;
  }
}, "Must be a valid ISO timestamp with a timezone offset");

export const tripBriefSchema = z.object({
  origin: z.object({
    city: z.string().min(1),
    country: z.string().min(1),
  }),
  destination: z.object({
    city: z.string().min(1),
    country: z.string().min(1),
  }),
  timeZone: z.string().min(1),
  travelers: z.number().int().positive(),
  travelWindow: z.object({
    startsAt: zonedDateTimeSchema,
    endsAt: zonedDateTimeSchema,
  }),
  hardBudget: z.object({
    currency: z.literal("USD"),
    amountMinorUnits: z.number().int().nonnegative(),
  }),
  preferences: z.array(z.string().min(1)).max(20),
  constraints: z.array(z.string().min(1)).max(20),
});

export type TripBrief = {
  origin: { city: string; country: string };
  destination: { city: string; country: string };
  timeZone: string;
  travelers: number;
  travelWindow: { startsAt: ZonedDateTime; endsAt: ZonedDateTime };
  hardBudget: { currency: "USD"; amountMinorUnits: MinorUnits };
  preferences: string[];
  constraints: string[];
};

export function parseTripBrief(input: unknown): TripBrief {
  const parsed = tripBriefSchema.parse(input);
  return {
    ...parsed,
    travelWindow: {
      startsAt: zonedDateTime(parsed.travelWindow.startsAt),
      endsAt: zonedDateTime(parsed.travelWindow.endsAt),
    },
    hardBudget: {
      ...parsed.hardBudget,
      amountMinorUnits: minorUnits(parsed.hardBudget.amountMinorUnits),
    },
  };
}
