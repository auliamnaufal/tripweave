"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser-side Supabase client — one per module, safe to import anywhere in client components. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
