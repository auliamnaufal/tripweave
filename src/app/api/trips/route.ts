import { z } from "zod";
import { authedUser } from "@/lib/supabase/authedUser";

export const runtime = "nodejs";

export async function GET() {
  const { supabase, user } = await authedUser();
  if (!user) return Response.json({ history: [] });

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
  destId: z.string().min(1),
  title: z.string().min(1),
  prefs: z.record(z.string(), z.unknown()),
  plan: z.unknown().optional(),
  isLive: z.boolean(),
  source: z.string().optional(),
  totalMinorUnits: z.number().int().nonnegative(),
  budgetMinorUnits: z.number().int().nonnegative(),
});

// Called once a plan finishes building (Planner.tsx's makePlan) — one row per
// planning session, so "recent plans" is just this table ordered by time.
export async function POST(request: Request) {
  const { supabase, user } = await authedUser();
  if (!user) return Response.json({ error: "Sign in to save trips." }, { status: 401 });

  let input: z.infer<typeof tripSchema>;
  try {
    input = tripSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid trip." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("trips")
    .insert({
      user_id: user.id,
      dest_id: input.destId,
      title: input.title,
      prefs: input.prefs,
      plan: input.plan ?? null,
      is_live: input.isLive,
      source: input.source ?? null,
      status: "planned",
      total_minor_units: input.totalMinorUnits,
      budget_minor_units: input.budgetMinorUnits,
    })
    .select("id")
    .single();
  if (error) return Response.json({ error: "Could not save trip." }, { status: 500 });
  return Response.json({ id: data.id });
}
