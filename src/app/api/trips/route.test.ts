import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { authedUser } from "@/lib/supabase/authedUser";

vi.mock("@/lib/supabase/authedUser", () => ({ authedUser: vi.fn() }));

type Result = { data: unknown; error: unknown };

/** Minimal stand-in for a Supabase query builder: every chain method returns itself, the terminal ones resolve. */
function queryBuilder(result: Result) {
  const b = {
    select: () => b,
    eq: () => b,
    order: () => b,
    insert: () => b,
    update: () => b,
    limit: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  };
  return b;
}

const tripBody = {
  destId: "oahu",
  title: "Oahu, 5 nights",
  prefs: { destId: "oahu" },
  isLive: false,
  totalMinorUnits: 100000,
  budgetMinorUnits: 150000,
};

function mockSupabase(result: Result) {
  const from = vi.fn(() => queryBuilder(result));
  vi.mocked(authedUser).mockResolvedValue({ supabase: { from } as unknown as Awaited<ReturnType<typeof authedUser>>["supabase"], user: { id: "u1" } as unknown as Awaited<ReturnType<typeof authedUser>>["user"] });
  return from;
}

describe("GET /api/trips", () => {
  it("returns the recent-plans list when no id is given", async () => {
    mockSupabase({ data: [{ id: "t1", title: "Oahu, 5 nights", dest_id: "oahu", created_at: "2026-01-01T00:00:00Z" }], error: null });

    const res = await GET(new Request("http://localhost/api/trips"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ history: [{ id: "t1", title: "Oahu, 5 nights", destId: "oahu", at: "2026-01-01T00:00:00Z" }] });
  });

  it("returns one trip's full record for a valid ?id=", async () => {
    mockSupabase({ data: { dest_id: "oahu", title: "Oahu, 5 nights", prefs: { destId: "oahu" }, plan: null, is_live: false }, error: null });

    const res = await GET(new Request("http://localhost/api/trips?id=550e8400-e29b-41d4-a716-446655440000"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ destId: "oahu", title: "Oahu, 5 nights", prefs: { destId: "oahu" }, plan: null, isLive: false });
  });

  it("404s when the trip doesn't exist (or isn't this user's)", async () => {
    mockSupabase({ data: null, error: null });

    const res = await GET(new Request("http://localhost/api/trips?id=550e8400-e29b-41d4-a716-446655440000"));

    expect(res.status).toBe(404);
  });

  it("rejects a malformed ?id= before querying the database", async () => {
    const from = mockSupabase({ data: null, error: null });

    const res = await GET(new Request("http://localhost/api/trips?id=not-a-uuid"));

    expect(res.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("POST /api/trips", () => {
  it("inserts a new trip when no id is given", async () => {
    const from = mockSupabase({ data: { id: "t1" }, error: null });

    const res = await POST(new Request("http://localhost/api/trips", { method: "POST", body: JSON.stringify(tripBody) }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "t1" });
    expect(from).toHaveBeenCalledWith("trips");
  });

  it("updates the same trip, scoped to this user, when ?id= is given in the body", async () => {
    const from = mockSupabase({ data: { id: "t1" }, error: null });

    const res = await POST(new Request("http://localhost/api/trips", { method: "POST", body: JSON.stringify({ ...tripBody, id: "550e8400-e29b-41d4-a716-446655440000" }) }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "t1" });
    expect(from).toHaveBeenCalledWith("trips");
  });

  it("404s updating a trip that doesn't exist (or isn't this user's)", async () => {
    mockSupabase({ data: null, error: null });

    const res = await POST(new Request("http://localhost/api/trips", { method: "POST", body: JSON.stringify({ ...tripBody, id: "550e8400-e29b-41d4-a716-446655440000" }) }));

    expect(res.status).toBe(404);
  });

  it("rejects an invalid body before touching the database", async () => {
    const from = mockSupabase({ data: null, error: null });

    const res = await POST(new Request("http://localhost/api/trips", { method: "POST", body: JSON.stringify({ title: "Missing fields" }) }));

    expect(res.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses to save for a guest", async () => {
    const from = vi.fn();
    vi.mocked(authedUser).mockResolvedValue({ supabase: { from } as unknown as Awaited<ReturnType<typeof authedUser>>["supabase"], user: null });

    const res = await POST(new Request("http://localhost/api/trips", { method: "POST", body: JSON.stringify(tripBody) }));

    expect(res.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
});
