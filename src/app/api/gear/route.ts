import { z } from "zod";
import { AFFILIATE_DISCLOSURE, Channel3Error, channel3Configured } from "@/features/gear/channel3";
import { gearCacheKey } from "@/features/gear/gearCache";
import { gearKits as kits } from "@/features/gear/kitStore";
import { buildGearKit } from "@/features/gear/gearKit";
import { parseTripBrief } from "@/features/planner/tripBrief";
import { canAccess } from "@/features/quotes/quote";
import { getQuote } from "@/features/quotes/quoteStore";
import { authedUser } from "@/lib/supabase/authedUser";

export const runtime = "nodejs";

const gearRequestSchema = z.object({ quoteId: z.string().uuid() });


/**
 * Gear worth packing for a priced plan, from real retailers via Channel3.
 * Read-only: it never changes the quote, and what it returns are link-outs,
 * not part of the Trip Order or its PayPal payment.
 */
export async function POST(request: Request) {
  let input: z.infer<typeof gearRequestSchema>;
  try {
    input = gearRequestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid gear request." }, { status: 400 });
  }

  if (!channel3Configured()) {
    return Response.json({ error: "Gear suggestions aren't set up on this server." }, { status: 503 });
  }

  try {
    const { user } = await authedUser();
    const quote = await getQuote(input.quoteId);
    if (!quote || !canAccess(quote, user?.id)) return Response.json({ error: "This plan was not found." }, { status: 404 });

    // Access is checked above on every request; only the build is cached.
    const kit = await kits.get(gearCacheKey(quote), () =>
      buildGearKit({ brief: parseTripBrief(quote.brief), offers: quote.offers, tripTotalMinorUnits: quote.totalMinorUnits }),
    );
    return Response.json({ ...kit, disclosure: AFFILIATE_DISCLOSURE });
  } catch (error) {
    if (error instanceof Channel3Error) {
      return Response.json({ error: "The product search is unavailable right now." }, { status: 503 });
    }
    console.error("gear kit failed", error);
    return Response.json({ error: "Couldn't put a gear list together right now." }, { status: 503 });
  }
}
