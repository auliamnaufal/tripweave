import { z } from "zod";
import { AFFILIATE_DISCLOSURE, Channel3Error, channel3Configured, similarGear } from "@/features/gear/channel3";
import { gearCacheKey } from "@/features/gear/gearCache";
import { gearRoom, MAX_GEAR_NEEDS } from "@/features/gear/gearKit";
import { gearKits } from "@/features/gear/kitStore";
import { parseTripBrief } from "@/features/planner/tripBrief";
import { canAccess } from "@/features/quotes/quote";
import { getQuote } from "@/features/quotes/quoteStore";
import { authedUser } from "@/lib/supabase/authedUser";

export const runtime = "nodejs";

const similarRequestSchema = z.object({
  quoteId: z.string().uuid(),
  productId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
});

/**
 * "More like this" for one gear pick: Channel3's closest products to it, held
 * to the plan's per-item cap. The cap always comes from the quote on the
 * server, never from the browser, so alternatives can't push gear past the
 * budget. Link-outs only, like the kit: never part of the PayPal payment.
 */
export async function POST(request: Request) {
  let input: z.infer<typeof similarRequestSchema>;
  try {
    input = similarRequestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!channel3Configured()) {
    return Response.json({ error: "Gear suggestions aren't set up on this server." }, { status: 503 });
  }

  try {
    const { user } = await authedUser();
    const quote = await getQuote(input.quoteId);
    if (!quote || !canAccess(quote, user?.id)) return Response.json({ error: "This plan was not found." }, { status: 404 });

    const kit = await gearKits.peek(gearCacheKey(quote))?.catch(() => null);
    if (kit && !kit.items.some((item) => item.products.some((product) => product.id === input.productId))) {
      return Response.json({ error: "That product isn't in this plan's gear list." }, { status: 404 });
    }
    // The kit's own cap when it's cached; otherwise the smallest cap a kit can
    // have (the most needs it ever lists), which can only be stricter.
    const brief = parseTripBrief(quote.brief);
    const cap = kit?.room.perItemCapMinorUnits ?? gearRoom(brief.hardBudget.amountMinorUnits, quote.totalMinorUnits, MAX_GEAR_NEEDS, brief.travelers).perItemCapMinorUnits;
    if (cap <= 0) return Response.json({ products: [], capMinorUnits: 0, disclosure: AFFILIATE_DISCLOSURE });

    const products = await similarGear(input.productId, cap);
    return Response.json({ products, capMinorUnits: cap, disclosure: AFFILIATE_DISCLOSURE });
  } catch (error) {
    if (error instanceof Channel3Error) {
      return Response.json({ error: "The product search is unavailable right now." }, { status: 503 });
    }
    console.error("similar gear failed", error);
    return Response.json({ error: "Couldn't find similar products right now." }, { status: 503 });
  }
}
