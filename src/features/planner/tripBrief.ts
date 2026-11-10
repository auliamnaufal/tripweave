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

const place = z.object({
  city: z.string().trim().min(1).max(80),
  country: z.string().trim().min(1).max(80),
});

const DAY_MS = 86_400_000;
/** Duffel accepts at most 9 passengers per offer request. */
export const MAX_TRAVELERS = 9;
export const MAX_NIGHTS = 30;

// Free text goes into the agent's prompt, so it is bounded: a short tag list
// and short constraints, not a place to paste instructions.
export const tripBriefSchema = z
  .object({
    origin: place,
    destination: place,
    timeZone: z.string().min(1).max(64),
    travelers: z.number().int().positive().max(MAX_TRAVELERS, `At most ${MAX_TRAVELERS} travellers per trip.`),
    travelWindow: z.object({
      startsAt: zonedDateTimeSchema,
      endsAt: zonedDateTimeSchema,
    }),
    hardBudget: z.object({
      currency: z.literal("USD"),
      amountMinorUnits: z.number().int().positive("The budget must be more than zero.").max(10_000_000),
    }),
    preferences: z.array(z.string().trim().min(1).max(60)).max(20),
    constraints: z.array(z.string().trim().min(1).max(240)).max(20),
  })
  .superRefine((brief, ctx) => {
    const start = Date.parse(brief.travelWindow.startsAt);
    const end = Date.parse(brief.travelWindow.endsAt);
    if (end <= start) {
      ctx.addIssue({ code: "custom", path: ["travelWindow", "endsAt"], message: "The trip must end after it starts." });
    } else if (end - start > (MAX_NIGHTS + 1) * DAY_MS) {
      ctx.addIssue({ code: "custom", path: ["travelWindow", "endsAt"], message: `Trips can be at most ${MAX_NIGHTS} nights.` });
    }
    if (
      brief.origin.city.toLowerCase() === brief.destination.city.toLowerCase() &&
      brief.origin.country.toLowerCase() === brief.destination.country.toLowerCase()
    ) {
      ctx.addIssue({ code: "custom", path: ["destination"], message: "Pick a destination different from where you're flying from." });
    }
  });

/** The first human-readable reason a brief was refused, for the planner to say back. */
export function briefProblem(input: unknown): string | null {
  const result = tripBriefSchema.safeParse(input);
  return result.success ? null : (result.error.issues[0]?.message ?? "The trip brief is invalid.");
}

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
