import { z } from "zod";
import { briefFromIntent, readIntent } from "@/features/agent/intake";

export const runtime = "nodejs";

const intakeRequestSchema = z.object({
  text: z.string().trim().min(2).max(1200),
  defaults: z.object({
    origin: z.object({ city: z.string().trim().min(1).max(80), country: z.string().trim().min(1).max(80) }),
    travelers: z.number().int().min(1).max(9),
    budgetUsd: z.number().positive().max(100_000),
  }),
});

/**
 * Free text in, a validated trip brief out. The model only interprets the
 * request; the brief is built and checked by code, and /api/plan then
 * searches, prices and plans it like any other brief.
 */
export async function POST(request: Request) {
  let input: z.infer<typeof intakeRequestSchema>;
  try {
    input = intakeRequestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Tell me where you'd like to go." }, { status: 400 });
  }

  try {
    const intent = await readIntent(input.text);
    if (intent.clarification || intent.stops.length === 0) {
      return Response.json({ clarification: intent.clarification ?? "Where would you like to go?" });
    }
    const brief = briefFromIntent(intent, input.defaults);
    if (!brief) return Response.json({ clarification: "Where would you like to go?" });
    return Response.json({ brief, summary: intent.summary, stops: intent.stops, dayPlans: brief.dayPlans ?? [] });
  } catch (error) {
    console.error("intake failed", error);
    const message = error instanceof Error && /night|travel|budget|destination|stop/i.test(error.message) ? error.message : "I couldn't read that request. Try naming a city and how many nights.";
    return Response.json({ error: message }, { status: 422 });
  }
}
