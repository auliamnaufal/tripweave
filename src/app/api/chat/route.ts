import { z } from "zod";
import { authedUser } from "@/lib/supabase/authedUser";

export const runtime = "nodejs";

const chatSchema = z.object({
  role: z.enum(["user", "agent"]),
  kind: z.string().optional(),
  text: z.string().min(1),
  tripId: z.string().uuid().nullable().optional(),
});

const tripIdSchema = z.string().uuid();

// Read-back for resuming a trip in the planner: its stored transcript, oldest first.
export async function GET(request: Request) {
  const { supabase, user } = await authedUser();
  if (!user) return Response.json({ messages: [] });

  const parsed = tripIdSchema.safeParse(new URL(request.url).searchParams.get("tripId"));
  if (!parsed.success) return Response.json({ error: "Invalid trip id." }, { status: 400 });

  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, text")
    .eq("user_id", user.id)
    .eq("trip_id", parsed.data)
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: "Could not load chat history." }, { status: 500 });

  return Response.json({ messages: (data ?? []).map((m) => ({ role: m.role as "user" | "agent", text: m.text })) });
}

// Best-effort: the planner chat keeps working for guests and even if this
// write fails, so callers fire this without blocking on the result.
export async function POST(request: Request) {
  const { supabase, user } = await authedUser();
  if (!user) return Response.json({ ok: true }); // guests: nothing to persist, not an error

  let input: z.infer<typeof chatSchema>;
  try {
    input = chatSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid message." }, { status: 400 });
  }

  const { error } = await supabase
    .from("chat_messages")
    .insert({ user_id: user.id, trip_id: input.tripId ?? null, role: input.role, kind: input.kind ?? null, text: input.text });
  if (error) return Response.json({ error: "Could not save message." }, { status: 500 });
  return Response.json({ ok: true });
}
