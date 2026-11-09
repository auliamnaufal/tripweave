import { ChatOpenAI } from "@langchain/openai";

/** Shared between plannerAgent and bookingAgent: both are thin LangGraph ReAct loops over the same provider. */
export function createAgentModel(): ChatOpenAI {
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

export type AgentMessage = {
  content?: unknown;
  name?: string;
  tool_calls?: { name: string; args: unknown }[];
};

export function lastMessageText(messages: unknown[]): string {
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

export function extractJson(text: string): unknown {
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
