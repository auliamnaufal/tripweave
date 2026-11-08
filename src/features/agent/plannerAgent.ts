import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import type { TripBrief } from "@/features/planner/tripBrief";
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

function lastMessageText(messages: unknown[]): string {
  const last = messages.at(-1) as { content?: unknown } | undefined;
  const content = last?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (
          block &&
          typeof block === "object" &&
          "text" in block &&
          typeof (block as { text: unknown }).text === "string"
        ) {
          return (block as { text: string }).text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Agent returned no JSON object.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export function parseAgentFinalMessage(text: string): AgentOutput {
  return agentOutputSchema.parse(extractJson(text));
}

export function createPlannerModel(): ChatOpenAI {
  const model = process.env.COMMAND_CODE_MODEL;
  if (!model) throw new Error("COMMAND_CODE_MODEL is not configured.");
  return new ChatOpenAI({
    model,
    apiKey: process.env.COMMAND_CODE_API_KEY,
    temperature: 0,
    configuration: {
      baseURL:
        process.env.COMMAND_CODE_PROVIDER_BASE_URL ??
        "https://api.commandcode.ai/provider/v1",
    },
  });
}

export async function runPlannerAgent(
  brief: TripBrief,
  deps: Partial<PlannerAgentDeps> = {},
): Promise<AgentOutput> {
  const llm = deps.llm ?? createPlannerModel();
  const { tools } = await makePlannerTools(brief);
  const agent = createReactAgent({ llm, tools, prompt: plannerSystemPrompt });
  const result = await agent.invoke({
    messages: [{ role: "user", content: JSON.stringify(brief) }],
  });
  const messages = (result as { messages: unknown[] }).messages;
  return parseAgentFinalMessage(lastMessageText(messages));
}
