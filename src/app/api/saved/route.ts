import { z } from "zod";
import { authedUser } from "@/lib/supabase/authedUser";

export const runtime = "nodejs";

export async function GET() {
  const { supabase, user } = await authedUser();
  if (!user) return Response.json({ saved: [] });
  const { data, error } = await supabase.from("saved_destinations").select("dest_id").eq("user_id", user.id);
  if (error) return Response.json({ error: "Could not load saved places." }, { status: 500 });
  return Response.json({ saved: (data ?? []).map((r) => r.dest_id) });
}

const destSchema = z.object({ destId: z.string().min(1) });

export async function POST(request: Request) {
  const { supabase, user } = await authedUser();
  if (!user) return Response.json({ error: "Sign in to save places." }, { status: 401 });
  let destId: string;
  try {
    destId = destSchema.parse(await request.json()).destId;
  } catch {
    return Response.json({ error: "Invalid destination." }, { status: 400 });
  }
  const { error } = await supabase.from("saved_destinations").upsert({ user_id: user.id, dest_id: destId });
  if (error) return Response.json({ error: "Could not save place." }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { supabase, user } = await authedUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const destId = new URL(request.url).searchParams.get("destId");
  if (!destId) return Response.json({ error: "Missing destId." }, { status: 400 });
  const { error } = await supabase.from("saved_destinations").delete().eq("user_id", user.id).eq("dest_id", destId);
  if (error) return Response.json({ error: "Could not remove place." }, { status: 500 });
  return Response.json({ ok: true });
}
