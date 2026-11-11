import { describe, expect, it } from "vitest";
import type { AgLlmRequest } from "ag-studio";
import { createEventMapper, toResponsesBody } from "./responsesAdapter";

describe("toResponsesBody", () => {
  it("maps Studio's conversation, tools and format onto the Responses API", () => {
    const request: AgLlmRequest = {
      instructions: "Be brief.",
      input: [
        { id: "u1", kind: "input", type: "message", role: "user", status: "completed", content: [{ type: "text", text: "Where did my money go?" }] },
        { id: "c1", kind: "output", type: "function_call", callId: "call_1", name: "reconcile_trip_orders", arguments: "{}" },
        { type: "function_call_output", callId: "call_1", output: "{\"ok\":true}", status: "completed" },
        { id: "r1", kind: "output", type: "reasoning", summary: [] },
        { id: "a1", kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: "All booked.", annotations: [] }] },
      ],
      tools: [{ name: "reconcile_trip_orders", description: "Check orders", parameters: { type: "object", properties: {} } }],
      toolChoice: { name: "reconcile_trip_orders" },
      responseFormat: { type: "text" },
      model: { id: "ignored-by-proxy", effort: "low" },
    };
    expect(toResponsesBody(request)).toEqual({
      instructions: "Be brief.",
      stream: true,
      parallel_tool_calls: true,
      input: [
        { role: "user", content: [{ type: "input_text", text: "Where did my money go?" }] },
        { type: "function_call", call_id: "call_1", name: "reconcile_trip_orders", arguments: "{}" },
        { type: "function_call_output", call_id: "call_1", output: "{\"ok\":true}" },
        { role: "assistant", content: [{ type: "output_text", text: "All booked.", annotations: [] }] },
      ],
      tools: [{ type: "function", name: "reconcile_trip_orders", description: "Check orders", parameters: { type: "object", properties: {} }, strict: false }],
      tool_choice: { type: "function", name: "reconcile_trip_orders" },
      reasoning: { effort: "low" },
    });
  });

  it("asks for a JSON schema answer when Studio wants structured output", () => {
    const body = toResponsesBody({ input: [], responseFormat: { type: "json", name: "plan", schema: { type: "object" } } });
    expect(body.text).toEqual({ format: { type: "json_schema", name: "plan", schema: { type: "object" }, strict: false } });
  });
});

describe("createEventMapper", () => {
  it("turns a streamed tool call into AG-UI events keyed by call id", () => {
    const map = createEventMapper();
    const events = [
      { type: "response.output_item.added", item: { id: "fc_1", type: "function_call", call_id: "call_9", name: "view_page" } },
      { type: "response.function_call_arguments.delta", item_id: "fc_1", delta: "{\"page" },
      { type: "response.output_item.done", item: { id: "fc_1", type: "function_call", call_id: "call_9" } },
    ].flatMap((e) => map(e).events);
    expect(events).toEqual([
      { type: "TOOL_CALL_START", toolCallId: "call_9", toolCallName: "view_page" },
      { type: "TOOL_CALL_ARGS", toolCallId: "call_9", delta: "{\"page" },
      { type: "TOOL_CALL_END", toolCallId: "call_9" },
    ]);
  });

  it("streams text and resolves the final response with its output and usage", () => {
    const map = createEventMapper();
    expect(map({ type: "response.output_item.added", item: { id: "m1", type: "message" } }).events).toEqual([
      { type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant" },
    ]);
    expect(map({ type: "response.output_text.delta", item_id: "m1", delta: "Hi" }).events).toEqual([{ type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "Hi" }]);
    const { final } = map({
      type: "response.completed",
      response: {
        id: "resp_1",
        created_at: 1,
        status: "completed",
        output: [
          { id: "m1", type: "message", content: [{ type: "output_text", text: "Hi" }] },
          { id: "fc_1", type: "function_call", call_id: "call_9", name: "view_page", arguments: "{}" },
        ],
        usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
      },
    });
    expect(final).toEqual({
      id: "resp_1",
      createdAt: 1,
      status: "completed",
      model: undefined,
      output: [
        { id: "m1", kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: "Hi", annotations: [] }] },
        { id: "fc_1", kind: "output", type: "function_call", callId: "call_9", name: "view_page", arguments: "{}", status: "completed" },
      ],
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12, reasoningTokens: undefined },
    });
  });

  it("reports a stream error as a failed response, not a thrown one", () => {
    const { final } = createEventMapper()({ type: "error", code: "rate_limit", message: "Slow down" });
    expect(final?.status).toBe("failed");
    expect(final?.error).toEqual({ code: "rate_limit", message: "Slow down" });
  });
});
