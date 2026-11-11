import { tool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import type { TravelOffer } from "@/features/planner/travelOffer";
import type { FreedActivity, RebookPick } from "@/features/rebook/rebook";
import { platformInfo } from "@/features/suppliers/platforms";
import { createAgentModel, extractJson, lastMessageText } from "./agentRuntime";

// The rebooking agent: after capture, for each activity that couldn't be
// booked and was refunded, it looks at what else fits that slot and proposes
// replacements for the timeline. It only chooses among candidates the
// server computed (`replacementCandidates`); the route re-checks every pick.
// A suggestion is never booked or charged by this agent.

export const rebookSystemPrompt = [
  "You are Tripweave's rebooking agent.",
  "The traveller paid for their trip once with PayPal. Some activities couldn't be booked by the supplier, so their price went back to the traveller's PayPal, and that time on the trip is now empty.",
  "For each freed activity, call find_replacements with its id to see the activities from the same search that fit that slot: inside the trip dates, clear of everything still booked, and no dearer than the refund.",
  "Pick at most two per freed activity, the ones closest to what was lost and to the traveller's preferences. Prefer the same day and similar time. Pick none if nothing is a sensible substitute.",
  "Never invent offers, prices, times or availability: use only ids returned by find_replacements.",
  'Answer with JSON only: {"suggestions":[{"forOfferId":"<freed id>","offerId":"<candidate id>","reason":"<one short sentence for the traveller, plain language, no ids>"}],"note":"<one short sentence summarising what you suggest, or why there is nothing>"}',
].join("\n");

export const rebookOutputSchema = z.object({
  suggestions: z
    .array(z.object({ forOfferId: z.string().min(1), offerId: z.string().min(1), reason: z.string().min(1).max(400) }))
    .max(12),
  note: z.string().min(1).max(400),
});
export type RebookAgentOutput = { suggestions: RebookPick[]; note: string };

export function parseRebookFinalMessage(text: string): RebookAgentOutput {
  return rebookOutputSchema.parse(extractJson(text));
}

const usd = (minor: number) => Math.round(minor) / 100;

function candidateView(offer: TravelOffer, freed: TravelOffer) {
  const platform = platformInfo(offer.supplier);
  return {
    id: offer.id,
    title: offer.title,
    summary: offer.summary,
    startsAt: offer.startsAt,
    endsAt: offer.endsAt,
    priceUsd: usd(offer.costMinorUnits),
    platform: platform.label,
    sameDay: offer.startsAt.slice(0, 10) === freed.startsAt.slice(0, 10),
  };
}

export function makeRebookTools(freed: readonly FreedActivity[], candidatesByFreed: ReadonlyMap<string, readonly TravelOffer[]>) {
  const findReplacements = tool(
    async ({ freedOfferId }) => {
      const hole = freed.find((item) => item.offer.id === freedOfferId);
      if (!hole) return JSON.stringify({ error: "Unknown freed activity id." });
      return JSON.stringify((candidatesByFreed.get(freedOfferId) ?? []).map((offer) => candidateView(offer, hole.offer)));
    },
    {
      name: "find_replacements",
      description: "Activities from the trip's own search that fit the slot a freed activity left: inside the trip dates, clear of every booking, priced within its refund.",
      schema: z.object({ freedOfferId: z.string().describe("The id of a freed activity.") }),
    },
  );
  return { tools: [findReplacements] };
}

/** One run of the rebooking agent. Its picks are untrusted until `acceptedPicks` checks them. */
export async function runRebookAgent(
  input: { freed: readonly FreedActivity[]; candidatesByFreed: ReadonlyMap<string, readonly TravelOffer[]>; preferences: readonly string[] },
  deps: { llm?: ChatOpenAI } = {},
): Promise<RebookAgentOutput> {
  const llm = deps.llm ?? createAgentModel();
  const { tools } = makeRebookTools(input.freed, input.candidatesByFreed);
  const agent = createReactAgent({ llm, tools, prompt: rebookSystemPrompt });
  const brief = {
    preferences: input.preferences,
    freed: input.freed.map(({ offer, refundMinorUnits, refunded }) => ({
      id: offer.id,
      title: offer.title,
      summary: offer.summary,
      startsAt: offer.startsAt,
      endsAt: offer.endsAt,
      refundUsd: usd(refundMinorUnits),
      refundSettled: refunded,
    })),
  };
  const result = (await agent.invoke({ messages: [{ role: "user", content: JSON.stringify(brief) }] })) as { messages: unknown[] };
  return parseRebookFinalMessage(lastMessageText(result.messages));
}
