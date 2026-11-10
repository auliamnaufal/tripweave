import { createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// "Continue with demo account" signs in to a real Supabase account, so the
// demo behaves like any other user: a server session, synced trips, receipts
// and sign-out. The account lives on a reserved example domain and its
// password is derived from the server secret, so it never ships to a browser
// and stays stable across restarts.
const DEMO_EMAIL = "demo@tripweave.example";
const DEMO_NAME = "Mara Okafor";

function demoPassword(): string {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Supabase is not configured.");
  return createHmac("sha256", secret).update("tripweave-demo-account").digest("base64url").slice(0, 32);
}

async function ensureDemoUser(password: string): Promise<void> {
  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password,
    email_confirm: true,
    user_metadata: { name: DEMO_NAME },
  });
  if (!created.error) return;
  // Already exists (e.g. the secret rotated): reset it to the current password.
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = data?.users.find((user) => user.email === DEMO_EMAIL);
  if (!existing) throw created.error;
  const updated = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  if (updated.error) throw updated.error;
}

export async function POST() {
  try {
    const password = demoPassword();
    const supabase = await createClient();
    let result = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password });
    if (result.error) {
      await ensureDemoUser(password);
      result = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password });
    }
    if (result.error) throw result.error;
    // The session cookies were set on this response by the server client.
    return Response.json({ ok: true });
  } catch (error) {
    console.error("demo sign-in failed", error);
    return Response.json({ error: "The demo account is unavailable right now." }, { status: 503 });
  }
}
