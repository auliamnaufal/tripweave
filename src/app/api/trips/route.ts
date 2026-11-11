import { z } from "zod";
import { authedUser } from "@/lib/supabase/authedUser";

export const runtime = "nodejs";

const tripIdSchema = z.string().uuid();

// With ?id=, returns one trip's full record (prefs/plan included) so the
// planner can resume it; otherwise the recent-plans list as before.
export async function GET(request: Request) {
  const { supabase, user } = await authedUser();
  if (!user) return Response.json({ history: [] });

  const idParam = new URL(request.url).searchParams.get("id");
  if (idParam !== null) {
    const parsed = tripIdSchema.safeParse(idParam);
    if (!parsed.success) return Response.json({ error: "Invalid trip id." }, { status: 400 });

    const { data, error } = await supabase
      .from("trips")
      .select("dest_id, title, prefs, plan, is_live")
      .eq("user_id", user.id)
      .eq("id", parsed.data)
      .maybeSingle();
    if (error) return Response.json({ error: "Could not load trip." }, { status: 500 });
    if (!data) return Response.json({ error: "Trip not found." }, { status: 404 });
    return Response.json({ destId: data.dest_id, title: data.title, prefs: data.prefs, plan: data.plan, isLive: data.is_live });
  }

  const { data, error } = await supabase
    .from("trips")
    .select("id, title, dest_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return Response.json({ error: "Could not load trip history." }, { status: 500 });

  const history = (data ?? []).map((t) => ({ id: t.id, title: t.title, destId: t.dest_id, at: t.created_at }));
  return Response.json({ history });
}

const tripSchema = z.object({
  id: z.string().uuid().optional(),
  destId: z.string().min(1),
  title: z.string().min(1),
  prefs: z.record(z.string(), z.unknown()),
  plan: z.unknown().optional(),
  isLive: z.boolean(),
  source: z.string().optional(),
  totalMinorUnits: z.number().int().nonnegative(),
  budgetMinorUnits: z.number().int().nonnegative(),
});

// Called once a plan finishes building, and again after every refinement, so
// a resumed trip's edits actually stick instead of only living in memory
// (Planner.tsx's makePlan/refine/refineLive/pickOption/swapLive).
export async function POST(request: Request) {
  const { supabase, user } = await authedUser();
  if (!user) return Response.json({ error: "Sign in to save trips." }, { status: 401 });

  let input: z.infer<typeof tripSchema>;
  try {
    input = tripSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid trip." }, { status: 400 });
  }

  const row = {
    dest_id: input.destId,
    title: input.title,
    prefs: input.prefs,
    plan: input.plan ?? null,
    is_live: input.isLive,
    source: input.source ?? null,
    total_minor_units: input.totalMinorUnits,
    budget_minor_units: input.budgetMinorUnits,
  };

  // An id means "update the trip already created for this session" — every
  // refinement after the first save lands here instead of an insert.
  if (input.id) {
    const { data, error } = await supabase
      .from("trips")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", input.id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) return Response.json({ error: "Could not update trip." }, { status: 500 });
    if (!data) return Response.json({ error: "Trip not found." }, { status: 404 });
    return Response.json({ id: data.id });
  }

  const { data, error } = await supabase
    .from("trips")
    .insert({ user_id: user.id, ...row, status: "planned" })
    .select("id")
    .single();
  if (error) return Response.json({ error: "Could not save trip." }, { status: 500 });
  return Response.json({ id: data.id });
}
