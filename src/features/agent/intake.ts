import { z } from "zod";
import type { ChatOpenAI } from "@langchain/openai";
import { createAgentModel, extractJson, lastMessageText } from "./agentRuntime";
import { MAX_NIGHTS, MAX_TRAVELERS, tripBriefSchema } from "@/features/planner/tripBrief";

// The intake agent: turns whatever the traveller typed ("Japan — Tokyo day 1,
// Osaka day 2, Mount Fuji day 3") into a structured trip brief. It only
// interprets; it never prices or books. Every field it returns is validated
// and defaulted by code before anything is searched.

const place = z.object({ city: z.string().trim().min(1).max(80), country: z.string().trim().min(1).max(80) });

export const intentSchema = z.object({
  clarification: z.string().max(240).nullable(),
  origin: place.nullable(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  travelers: z.number().int().min(1).max(MAX_TRAVELERS).nullable(),
  budgetUsd: z.number().positive().max(100_000).nullable(),
  stops: z.array(place.extend({ nights: z.number().int().min(1).max(MAX_NIGHTS) })).max(5),
  dayPlans: z.array(z.object({ day: z.number().int().min(1).max(MAX_NIGHTS + 1), wish: z.string().trim().min(1).max(120) })).max(14),
  preferences: z.array(z.string().trim().min(1).max(60)).max(10),
  summary: z.string().max(400),
});
export type TripIntent = z.infer<typeof intentSchema>;

export function intakePrompt(today: string): string {
  return [
    "You read a traveller's free-text trip request (any language) and return ONLY a JSON object, no prose.",
    `Today is ${today}.`,
    "Fields:",
    '- "stops": the cities they will sleep in, in travel order, each with "city", "country" (English names) and "nights" (at least 1). A single-city trip has one stop.',
    '- "dayPlans": things they asked to do on a specific day, 1-based from arrival day: {"day": 3, "wish": "Mount Fuji"}. Short English wish, no prices.',
    "- A place visited as a day trip (Mount Fuji, Nara, a national park) is a dayPlan, not a stop, unless they say they want to sleep there.",
    '- If they assign cities to days ("Tokyo day 1, Osaka day 2"), make each city a stop with as many nights as days spent there, and put the day trip on its day, sleeping in the nearest stop.',
    '- "startDate": YYYY-MM-DD if they gave a date or month (use the 10th of a month they named), else null. Never a date before today.',
    '- "origin": where they fly from, only if they said so, else null.',
    '- "travelers", "budgetUsd": only if stated (convert other currencies to USD roughly), else null.',
    '- "preferences": short tags like "food", "slow mornings", "culture" that they expressed.',
    '- "summary": one short English sentence restating the route (the app is in English), e.g. "Tokyo 1 night, then Osaka 2 nights, with a Mount Fuji day trip on day 3."',
    '- "clarification": null, unless no destination can be identified at all; then a short English question and empty stops.',
    "Never invent hotels, flights or prices.",
    'Shape: {"clarification":null,"origin":null,"startDate":null,"travelers":null,"budgetUsd":null,"stops":[{"city":"","country":"","nights":1}],"dayPlans":[],"preferences":[],"summary":""}',
  ].join("\n");
}

export async function readIntent(text: string, deps: { llm?: ChatOpenAI; today?: Date } = {}): Promise<TripIntent> {
  const llm = deps.llm ?? createAgentModel();
  const today = (deps.today ?? new Date()).toISOString().slice(0, 10);
  const reply = await llm.invoke([
    { role: "system", content: intakePrompt(today) },
    { role: "user", content: text.slice(0, 1200) },
  ]);
  return intentSchema.parse(extractJson(lastMessageText([reply])));
}

export type IntakeDefaults = {
  origin: { city: string; country: string };
  travelers: number;
  budgetUsd: number;
};

const DAY_MS = 86_400_000;

/**
 * Code, not the model, turns an intent into a brief: fills what wasn't said
 * from the traveller's defaults, keeps dates in the future, and validates the
 * result with the same schema /api/plan enforces.
 */
export function briefFromIntent(intent: TripIntent, defaults: IntakeDefaults, today = new Date()) {
  if (intent.stops.length === 0) return null;
  const earliest = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) + 3 * DAY_MS;
  const asked = intent.startDate ? Date.parse(`${intent.startDate}T00:00:00Z`) : NaN;
  const start = Number.isFinite(asked) && asked >= earliest ? asked : earliest + 27 * DAY_MS;
  const nights = Math.min(MAX_NIGHTS, intent.stops.reduce((sum, stop) => sum + stop.nights, 0));
  const end = start + nights * DAY_MS;
  const iso = (ms: number, endOfDay = false) => `${new Date(ms).toISOString().slice(0, 10)}T${endOfDay ? "23:59:59" : "00:00:00"}Z`;
  const travelers = intent.travelers ?? defaults.travelers;
  const totalDays = nights + 1;

  const brief = {
    origin: intent.origin ?? defaults.origin,
    destination: { city: intent.stops[0].city, country: intent.stops[0].country },
    timeZone: "UTC",
    travelers,
    travelWindow: { startsAt: iso(start), endsAt: iso(end, true) },
    hardBudget: { currency: "USD" as const, amountMinorUnits: Math.round((intent.budgetUsd ?? defaults.budgetUsd) * 100) },
    preferences: intent.preferences.length ? intent.preferences : ["relaxed pace"],
    constraints: [] as string[],
    ...(intent.stops.length > 1 ? { stops: intent.stops } : {}),
    ...(intent.dayPlans.length ? { dayPlans: intent.dayPlans.filter((plan) => plan.day <= totalDays) } : {}),
  };
  const checked = tripBriefSchema.safeParse(brief);
  if (!checked.success) throw new Error(checked.error.issues[0]?.message ?? "That trip can't be planned.");
  return brief;
}
