import { z } from "zod";
import { authedUser } from "@/lib/supabase/authedUser";

export const runtime = "nodejs";

// Proxy for the Trip spend dashboard's AI agents (AG Studio). The adapter in
// src/features/insights/ai/responsesAdapter.ts runs in the browser and posts a
// Responses API body here; this adds the server's OpenAI key, pins the model,
// bounds the turn and streams the SSE reply straight back. The key never
// reaches the browser, and only a signed-in traveller can spend it.

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
/** Bounds one turn whatever the client asks for. Reasoning tokens count towards it. */
const MAX_OUTPUT_TOKENS = 16_000;

// Only the fields the adapter sends are forwarded; anything else is dropped,
// so the browser can't pick the model, turn storage on or raise the cap.
const bodySchema = z.object({
  input: z.array(z.record(z.string(), z.unknown())).max(400),
  instructions: z.string().max(200_000).optional(),
  tools: z.array(z.record(z.string(), z.unknown())).max(64).optional(),
  tool_choice: z.union([z.enum(["auto", "none", "required"]), z.object({ type: z.literal("function"), name: z.string().max(128) })]).optional(),
  text: z.record(z.string(), z.unknown()).optional(),
  reasoning: z.object({ effort: z.enum(["minimal", "low", "medium", "high"]) }).optional(),
  parallel_tool_calls: z.boolean().optional(),
});

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return fail(400, "That isn't a request the assistant understands.");
  }

  const { user } = await authedUser();
  if (!user) return fail(401, "Sign in to use the assistant.");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fail(503, "The assistant isn't configured on this server.");

  const upstream = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      ...body,
      model: process.env.OPENAI_MODEL || "gpt-6-luna",
      stream: true,
      store: false,
      max_output_tokens: MAX_OUTPUT_TOKENS,
    }),
    // Stopping the chat in Studio aborts the browser request, which cancels this one.
    signal: request.signal,
  });

  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.json().catch(() => null)) as { error?: { message?: string } } | null;
    console.error("[ai/responses] upstream", upstream.status, detail?.error?.message);
    return fail(upstream.status === 429 ? 429 : 502, upstream.status === 429 ? "The assistant is busy. Try again in a moment." : "The assistant couldn't answer just now.");
  }

  return new Response(upstream.body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
  });
}
