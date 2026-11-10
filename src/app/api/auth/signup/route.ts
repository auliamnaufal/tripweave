import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const signupSchema = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(1) });

// Creates the account server-side (pre-confirmed — no email round trip for
// this demo-turned-real app). The client signs in right after with its own
// password grant; this route only ever creates the user.
export async function POST(request: Request) {
  let input: { email: string; password: string; name: string };
  try {
    input = signupSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Enter a valid email and an 8+ character password." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
  });
  if (error) {
    const message = error.message.includes("already been registered") ? "An account with that email already exists." : "Could not create that account.";
    return Response.json({ error: message }, { status: 400 });
  }
  return Response.json({ ok: true });
}
