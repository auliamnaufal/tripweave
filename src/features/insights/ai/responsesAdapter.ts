import type {
  AgAiConversationItem,
  AgAiEvent,
  AgAiOutputItem,
  AgLlmAdapter,
  AgLlmRequest,
  AgLlmResponse,
} from "ag-studio";

// AG Studio's agents talk to an LLM through one adapter (AgLlmAdapter). This
// one speaks the OpenAI Responses API through Tripweave's own proxy
// (/api/ai/responses), which holds the key, pins the model and caps the turn.
// The adapter only relays: Studio runs the tools and sends their results back
// as function_call_output items on the next turn.

type ResponsesInputItem = Record<string, unknown>;

/** Studio's conversation items → Responses API `input` items. */
export function toResponsesInput(items: readonly AgAiConversationItem[]): ResponsesInputItem[] {
  const out: ResponsesInputItem[] = [];
  for (const item of items) {
    switch (item.type) {
      case "message":
        if (item.kind === "input") {
          const text = item.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
          if (text) out.push({ role: item.role, content: [{ type: "input_text", text }] });
        } else {
          const text = item.content.map((c) => (c.type === "text" ? c.text : c.refusal)).join("");
          if (text) out.push({ role: "assistant", content: [{ type: "output_text", text, annotations: [] }] });
        }
        break;
      case "function_call":
        out.push({ type: "function_call", call_id: item.callId, name: item.name, arguments: item.arguments });
        break;
      case "function_call_output":
        out.push({ type: "function_call_output", call_id: item.callId, output: item.output });
        break;
      // Reasoning isn't replayed: the proxy runs with store: false, so there is
      // no server-side item to point back to.
      case "reasoning":
        break;
    }
  }
  return out;
}

/** The body the proxy forwards. The model is chosen by the server, not here. */
export function toResponsesBody(request: AgLlmRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    input: toResponsesInput(request.input),
    stream: true,
    parallel_tool_calls: true,
  };
  if (request.instructions) body.instructions = request.instructions;
  if (request.tools?.length) {
    body.tools = request.tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      // Studio's schemas use optional properties, which strict mode forbids.
      strict: false,
    }));
  }
  if (request.toolChoice) {
    body.tool_choice = typeof request.toolChoice === "string" ? request.toolChoice : { type: "function", name: request.toolChoice.name };
  }
  if (request.responseFormat.type === "json") {
    body.text = {
      format: { type: "json_schema", name: request.responseFormat.name, schema: request.responseFormat.schema, strict: false },
    };
  }
  if (request.model?.effort) body.reasoning = { effort: request.model.effort };
  return body;
}

type RawItem = {
  id?: string;
  type?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  status?: string;
  content?: { type?: string; text?: string; refusal?: string }[];
  summary?: { text?: string }[];
};
type RawResponse = {
  id?: string;
  created_at?: number;
  status?: AgLlmResponse["status"];
  model?: string;
  output?: RawItem[];
  error?: { code?: string; message?: string } | null;
  incomplete_details?: { reason?: "max_output_tokens" | "content_filter" } | null;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } };
};

function toOutputItem(item: RawItem): AgAiOutputItem | null {
  const id = item.id ?? crypto.randomUUID();
  if (item.type === "message") {
    return {
      id,
      kind: "output",
      type: "message",
      role: "assistant",
      status: "completed",
      content: (item.content ?? []).map((c) =>
        c.type === "refusal" ? { type: "refusal" as const, refusal: c.refusal ?? "" } : { type: "text" as const, text: c.text ?? "", annotations: [] },
      ),
    };
  }
  if (item.type === "function_call") {
    return { id, kind: "output", type: "function_call", callId: item.call_id ?? id, name: item.name ?? "", arguments: item.arguments ?? "{}", status: "completed" };
  }
  if (item.type === "reasoning") {
    return { id, kind: "output", type: "reasoning", summary: (item.summary ?? []).map((s) => ({ type: "summary" as const, text: s.text ?? "" })) };
  }
  return null;
}

/** A finished Responses API response → what Studio's `complete` resolves to. */
export function toLlmResponse(raw: RawResponse): AgLlmResponse {
  return {
    id: raw.id ?? crypto.randomUUID(),
    createdAt: raw.created_at ?? Math.floor(Date.now() / 1000),
    status: raw.status ?? "completed",
    model: raw.model,
    output: (raw.output ?? []).map(toOutputItem).filter((item): item is AgAiOutputItem => item !== null),
    ...(raw.error ? { error: { code: raw.error.code ?? "error", message: raw.error.message ?? "The model call failed." } } : {}),
    ...(raw.incomplete_details?.reason ? { incompleteDetails: { reason: raw.incomplete_details.reason } } : {}),
    ...(raw.usage
      ? {
          usage: {
            inputTokens: raw.usage.input_tokens ?? 0,
            outputTokens: raw.usage.output_tokens ?? 0,
            totalTokens: raw.usage.total_tokens,
            reasoningTokens: raw.usage.output_tokens_details?.reasoning_tokens,
          },
        }
      : {}),
  };
}

type StreamEvent = { type: string; [key: string]: unknown };

/**
 * Turns Responses API stream events into AG-UI events, in order. Returns the
 * final response when the stream reports one (completed, failed or incomplete).
 */
export function createEventMapper() {
  // Text deltas are keyed by item id, argument deltas by item id too; Studio
  // wants the call id for tool events.
  const callIdByItem = new Map<string, string>();
  return function map(event: StreamEvent): { events: AgAiEvent[]; final?: AgLlmResponse } {
    switch (event.type) {
      case "response.output_item.added": {
        const item = event.item as RawItem;
        if (item.type === "message" && item.id) return { events: [{ type: "TEXT_MESSAGE_START", messageId: item.id, role: "assistant" }] };
        if (item.type === "function_call" && item.id) {
          const callId = item.call_id ?? item.id;
          callIdByItem.set(item.id, callId);
          return { events: [{ type: "TOOL_CALL_START", toolCallId: callId, toolCallName: item.name ?? "" }] };
        }
        if (item.type === "reasoning" && item.id) return { events: [{ type: "REASONING_MESSAGE_START", messageId: item.id, role: "reasoning" }] };
        return { events: [] };
      }
      case "response.output_text.delta":
        return { events: [{ type: "TEXT_MESSAGE_CONTENT", messageId: String(event.item_id), delta: String(event.delta ?? "") }] };
      case "response.reasoning_summary_text.delta":
        return { events: [{ type: "REASONING_MESSAGE_CONTENT", messageId: String(event.item_id), delta: String(event.delta ?? "") }] };
      case "response.function_call_arguments.delta": {
        const itemId = String(event.item_id);
        return { events: [{ type: "TOOL_CALL_ARGS", toolCallId: callIdByItem.get(itemId) ?? itemId, delta: String(event.delta ?? "") }] };
      }
      case "response.output_item.done": {
        const item = event.item as RawItem;
        if (item.type === "message" && item.id) return { events: [{ type: "TEXT_MESSAGE_END", messageId: item.id }] };
        if (item.type === "function_call" && item.id) return { events: [{ type: "TOOL_CALL_END", toolCallId: callIdByItem.get(item.id) ?? item.call_id ?? item.id }] };
        if (item.type === "reasoning" && item.id) return { events: [{ type: "REASONING_MESSAGE_END", messageId: item.id }] };
        return { events: [] };
      }
      case "response.completed":
      case "response.failed":
      case "response.incomplete":
        return { events: [], final: toLlmResponse(event.response as RawResponse) };
      case "error":
        return {
          events: [],
          final: toLlmResponse({ status: "failed", error: { code: String(event.code ?? "error"), message: String(event.message ?? "The model call failed.") } }),
        };
      default:
        return { events: [] };
    }
  };
}

/** Splits a text/event-stream body into parsed `data:` payloads. */
async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  // TextDecoderStream is typed for BufferSource; it accepts the Uint8Array chunks a fetch body yields.
  const reader = body.pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      try {
        yield JSON.parse(data) as StreamEvent;
      } catch {
        // A malformed frame is skipped; the final response still decides the turn.
      }
    }
  }
}

export function responsesAdapter({ endpoint }: { endpoint: string }): AgLlmAdapter {
  return {
    executeTurn(request, options) {
      let resolveComplete!: (response: AgLlmResponse) => void;
      const complete = new Promise<AgLlmResponse>((resolve) => (resolveComplete = resolve));
      const failed = (message: string, code = "error") => resolveComplete(toLlmResponse({ status: "failed", error: { code, message } }));

      async function* stream(): AsyncGenerator<AgAiEvent> {
        let finished = false;
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(toResponsesBody(request)),
            signal: options?.signal,
          });
          if (!res.ok || !res.body) {
            const body = (await res.json().catch(() => null)) as { error?: string | { message?: string } } | null;
            const message = typeof body?.error === "string" ? body.error : body?.error?.message;
            failed(message ?? `The assistant is unavailable (${res.status}).`, String(res.status));
            finished = true;
            return;
          }
          const map = createEventMapper();
          for await (const event of sseEvents(res.body)) {
            const { events, final } = map(event);
            yield* events;
            if (final) {
              resolveComplete(final);
              finished = true;
            }
          }
          if (!finished) failed("The assistant stopped before finishing its answer.");
        } catch (err) {
          if (options?.signal?.aborted) {
            resolveComplete(toLlmResponse({ status: "cancelled" }));
          } else {
            failed(err instanceof Error ? err.message : "The assistant is unavailable.");
          }
        }
      }

      return { stream: stream(), complete };
    },
  };
}
