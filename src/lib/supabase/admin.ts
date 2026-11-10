import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Secret-key client: bypasses Row Level Security. Server-only, and only for
 * paths with no logged-in user to scope a query to (e.g. the PayPal capture
 * route, which books on the traveler's behalf after payment, not as a query
 * the traveler's own session is making).
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
