import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { authedUser } from "@/lib/supabase/authedUser";

vi.mock("@/lib/supabase/authedUser", () => ({ authedUser: vi.fn() }));

function mockSupabase(data: unknown) {
  const b = { select: () => b, eq: () => b, order: () => Promise.resolve({ data, error: null }) };
  const from = vi.fn(() => b);
  vi.mocked(authedUser).mockResolvedValue({ supabase: { from } as unknown as Awaited<ReturnType<typeof authedUser>>["supabase"], user: { id: "u1" } as unknown as Awaited<ReturnType<typeof authedUser>>["user"] });
}

describe("GET /api/orders", () => {
  it("rounds the dollar total the same way the live adapter does, so a captured amount with cents still matches a paid plan's whole-dollar total", async () => {
    mockSupabase([{ label: "o1", title: "Oahu, 5 nights", dest_id: "oahu", total_minor_units: 123456, items: 3, created_at: "2026-01-01T00:00:00Z" }]);

    const res = await GET();

    expect((await res.json()).orders[0].total).toBe(1235);
  });

  it("returns no orders for a guest", async () => {
    vi.mocked(authedUser).mockResolvedValue({ supabase: {} as Awaited<ReturnType<typeof authedUser>>["supabase"], user: null });

    expect(await (await GET()).json()).toEqual({ orders: [] });
  });
});
