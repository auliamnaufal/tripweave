import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import type { TripBrief } from "@/features/planner/tripBrief";
import type { ItineraryPlan, TravelOffer } from "@/features/planner/travelOffer";
import { createAgentModel, extractJson, lastMessageText, type AgentMessage } from "./agentRuntime";
import { plannerSystemPrompt } from "./prompt";
import { makePlannerTools } from "./tools";

export const agentOutputSchema = z.object({
  offerIds: z.array(z.string()),
  note: z.string().min(1).max(500),
});
export type AgentOutput = z.infer<typeof agentOutputSchema>;

export type PlannerAgentDeps = {
  llm: ChatOpenAI;
};

export type ToolName = "search_flights" | "search_hotels" | "search_activities" | "build_itinerary";

export type PlannerStreamEvent =
  | { kind: "tool-call"; tool: ToolName; label: string }
  | { kind: "tool-result"; tool: ToolName; summary: string }
  | { kind: "note"; text: string };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const TOOL_LABELS: Record<ToolName, string> = {
  search_flights: "Searching flights…",
  search_hotels: "Searching hotels…",
  search_activities: "Searching activities…",
  build_itinerary: "Checking totals and feasibility…",
};

function isToolName(value: string): value is ToolName {
  return value in TOOL_LABELS;
}

function toolCallLabel(tool: ToolName, args: unknown): string {
  if (tool === "build_itinerary" && args && typeof args === "object" && "offerIds" in args) {
    const count = (args as { offerIds: unknown[] }).offerIds.length;
    return `Checking ${count} offer${count === 1 ? "" : "s"} against your budget…`;
  }
  return TOOL_LABELS[tool];
}

function summarizeToolResult(tool: ToolName, content: string): string {
  try {
    const parsed: unknown = JSON.parse(content);
    if (tool === "build_itinerary") {
      const plan = parsed as ItineraryPlan;
      const total = money.format(plan.totalCostMinorUnits / 100);
      return plan.status === "feasible" ? `${total} total, fits the budget.` : `${total} total, needs changes.`;
    }
    const count = Array.isArray(parsed) ? parsed.length : 0;
    return count === 0 ? "No offers found." : `Found ${count} offer${count === 1 ? "" : "s"}.`;
  } catch {
    return "Done.";
  }
}

export function parseAgentFinalMessage(text: string): AgentOutput {
  return agentOutputSchema.parse(extractJson(text));
}

/**
 * Runs the ReAct loop and yields one event per tool call and tool result as they
 * happen, so a caller can show the agent's process live instead of waiting for
 * the final answer. Returns the parsed final offer selection once the agent
 * stops calling tools and answers with JSON, per `plannerSystemPrompt`.
 */
export async function* streamPlannerAgent(
  brief: TripBrief,
  catalog: readonly TravelOffer[],
  deps: Partial<PlannerAgentDeps> = {},
): AsyncGenerator<PlannerStreamEvent, AgentOutput> {
  const llm = deps.llm ?? createAgentModel();
  const { tools } = makePlannerTools(brief, catalog);
  const agent = createReactAgent({ llm, tools, prompt: plannerSystemPrompt });
  const stream = await agent.stream(
    { messages: [{ role: "user", content: JSON.stringify(brief) }] },
    { streamMode: "updates" },
  );

  let finalOutput: AgentOutput | null = null;
  for await (const chunk of stream as AsyncIterable<Record<string, { messages: AgentMessage[] }>>) {
    const agentStep = chunk.agent;
    if (agentStep) {
      for (const message of agentStep.messages) {
        for (const call of message.tool_calls ?? []) {
          if (!isToolName(call.name)) continue;
          yield { kind: "tool-call", tool: call.name, label: toolCallLabel(call.name, call.args) };
        }
        const text = lastMessageText([message]).trim();
        if (text && !message.tool_calls?.length) {
          try {
            finalOutput = parseAgentFinalMessage(text);
          } catch {
            yield { kind: "note", text };
          }
        }
      }
    }
    const toolsStep = chunk.tools;
    if (toolsStep) {
      for (const message of toolsStep.messages) {
        if (!message.name || !isToolName(message.name)) continue;
        yield { kind: "tool-result", tool: message.name, summary: summarizeToolResult(message.name, lastMessageText([message])) };
      }
    }
  }

  if (!finalOutput) throw new Error("Agent did not return a final plan.");
  return finalOutput;
}
