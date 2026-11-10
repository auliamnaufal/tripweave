import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { createAgentModel, extractJson, lastMessageText, type AgentMessage } from "./agentRuntime";
import { bookingSystemPrompt } from "./prompt";
import { makeBookingTools } from "./tools";
import type { BookingStreamEvent, BookingToolName } from "@/features/suppliers/bookingExecutor";

export const bookingResultSchema = z.discriminatedUnion("status", [
  z.object({ offerId: z.string(), status: z.literal("booked"), bookingRef: z.string() }),
  z.object({ offerId: z.string(), status: z.literal("failed"), reason: z.string() }),
]);
export const bookingAgentOutputSchema = z.object({
  results: z.array(bookingResultSchema),
  note: z.string().min(1).max(500),
});
export type BookingAgentOutput = z.infer<typeof bookingAgentOutputSchema>;

// Event types are shared with the deterministic executor that capture uses
// today. This agent is kept for when booking becomes conversational; it books
// through the same supplier registry.
export type { BookingStreamEvent, BookingToolName };

export type BookingAgentDeps = { llm: ChatOpenAI };

const BOOKING_TOOL_LABELS: Record<BookingToolName, string> = {
  book_flight: "Booking flight…",
  book_hotel: "Booking hotel…",
  book_activity: "Booking activity…",
};

function isBookingToolName(value: string): value is BookingToolName {
  return value in BOOKING_TOOL_LABELS;
}

function summarizeBookingResult(content: string): string {
  try {
    const parsed = JSON.parse(content) as { status?: string; reason?: string };
    return parsed.status === "booked" ? "Booked." : `Failed: ${parsed.reason ?? "unknown reason"}`;
  } catch {
    return "Done.";
  }
}

export function parseBookingAgentFinalMessage(text: string): BookingAgentOutput {
  return bookingAgentOutputSchema.parse(extractJson(text));
}

/**
 * Executes every offer in a paid itinerary as its own booking tool call, one
 * event per call/result, mirroring streamPlannerAgent's shape so the UI can
 * reuse the same process-list rendering for both phases.
 */
export async function* streamBookingAgent(
  offers: readonly TravelOffer[],
  forceFailureOfferId: string | undefined = undefined,
  deps: Partial<BookingAgentDeps> = {},
): AsyncGenerator<BookingStreamEvent, BookingAgentOutput> {
  const llm = deps.llm ?? createAgentModel();
  const { tools } = makeBookingTools(offers, forceFailureOfferId);
  const agent = createReactAgent({ llm, tools, prompt: bookingSystemPrompt });
  const manifest = offers.map((offer) => ({ offerId: offer.id, productKind: offer.productKind }));
  const stream = await agent.stream(
    { messages: [{ role: "user", content: JSON.stringify({ offers: manifest }) }] },
    { streamMode: "updates" },
  );

  let finalOutput: BookingAgentOutput | null = null;
  for await (const chunk of stream as AsyncIterable<Record<string, { messages: AgentMessage[] }>>) {
    const agentStep = chunk.agent;
    if (agentStep) {
      for (const message of agentStep.messages) {
        for (const call of message.tool_calls ?? []) {
          if (!isBookingToolName(call.name)) continue;
          yield { kind: "tool-call", tool: call.name, label: BOOKING_TOOL_LABELS[call.name] };
        }
        const text = lastMessageText([message]).trim();
        if (text && !message.tool_calls?.length) {
          try {
            finalOutput = parseBookingAgentFinalMessage(text);
          } catch {
            yield { kind: "note", text };
          }
        }
      }
    }
    const toolsStep = chunk.tools;
    if (toolsStep) {
      for (const message of toolsStep.messages) {
        if (!message.name || !isBookingToolName(message.name)) continue;
        yield {
          kind: "tool-result",
          tool: message.name,
          summary: summarizeBookingResult(lastMessageText([message])),
        };
      }
    }
  }

  if (!finalOutput) throw new Error("Booking agent did not return a final result.");
  return finalOutput;
}
