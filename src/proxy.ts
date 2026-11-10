import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Runs before every request (Next.js 16 "proxy", formerly middleware):
// 1. refreshes the Supabase auth cookie, so a session doesn't silently expire mid-visit;
// 2. guards the app's pages on the server, so a signed-out visitor never sees
//    a flash of the planner before being sent to sign in, and a signed-in one
//    never lands on the sign-in page again.

/** Pages that need an account. APIs check auth themselves; PayPal's return page must always load. */
const PROTECTED = ["/plan", "/trip", "/checkout", "/booked", "/account", "/tickets"];
const OPEN = ["/checkout/return"];

export function needsAccount(pathname: string): boolean {
  if (OPEN.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return false;
  return PROTECTED.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { pathname, search } = request.nextUrl;

  // A redirect must carry any refreshed auth cookies along with it.
  const redirect = (to: URL) => {
    const out = NextResponse.redirect(to);
    response.cookies.getAll().forEach((cookie) => out.cookies.set(cookie));
    return out;
  };

  if (!user && needsAccount(pathname)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return redirect(login);
  }

  if (user && pathname === "/login") {
    const asked = request.nextUrl.searchParams.get("next");
    const next = asked && asked.startsWith("/") && !asked.startsWith("//") ? asked : "/plan";
    return redirect(new URL(next, request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif)$).*)"],
};
