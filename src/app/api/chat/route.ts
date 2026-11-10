import { z } from "zod";
import { authedUser } from "@/lib/supabase/authedUser";

export const runtime = "nodejs";

const chatSchema = z.object({
  role: z.enum(["user", "agent"]),
  kind: z.string().optional(),
  text: z.string().min(1),
  tripId: z.string().uuid().nullable().optional(),
});

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
