import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { authedUser } from "@/lib/supabase/authedUser";

vi.mock("@/lib/supabase/authedUser", () => ({ authedUser: vi.fn() }));

type Result = { data: unknown; error: unknown };

function queryBuilder(result: Result) {
  const b = { select: () => b, eq: () => b, order: () => Promise.resolve(result) };
  return b;
}

function mockSupabase(result: Result, user: { id: string } | null = { id: "u1" }) {
  const from = vi.fn(() => queryBuilder(result));
  vi.mocked(authedUser).mockResolvedValue({ supabase: { from } as unknown as Awaited<ReturnType<typeof authedUser>>["supabase"], user: user as unknown as Awaited<ReturnType<typeof authedUser>>["user"] });
  return from;
}

describe("GET /api/chat", () => {
  it("returns the stored transcript for a trip, oldest first", async () => {
    mockSupabase({ data: [{ role: "user", text: "Oahu" }, { role: "agent", text: "Good choice." }], error: null });

    const res = await GET(new Request("http://localhost/api/chat?tripId=550e8400-e29b-41d4-a716-446655440000"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      messages: [{ role: "user", text: "Oahu" }, { role: "agent", text: "Good choice." }],
    });
  });

  it("rejects a missing or invalid tripId before querying the database", async () => {
    const from = mockSupabase({ data: null, error: null });

    const res = await GET(new Request("http://localhost/api/chat"));

    expect(res.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns no messages for a guest, without querying the database", async () => {
    const from = mockSupabase({ data: null, error: null }, null);

    const res = await GET(new Request("http://localhost/api/chat?tripId=550e8400-e29b-41d4-a716-446655440000"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ messages: [] });
    expect(from).not.toHaveBeenCalled();
  });
});
