import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Server-side Supabase client for Route Handlers and Server Components — reads/writes the session cookie. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component with no response to attach cookies to —
            // middleware.ts below is what actually keeps the session refreshed in that case.
          }
        },
      },
    },
  );
}
