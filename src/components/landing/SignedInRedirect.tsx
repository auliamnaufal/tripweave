"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHydrated, useUser } from "@/features/ui-mock/tripStore";

/** Once someone is signed in, the planner is home: the landing page sends them straight there. */
export function SignedInRedirect({ to = "/plan" }: { to?: string }) {
  const hydrated = useHydrated();
  const user = useUser();
  const router = useRouter();
  useEffect(() => {
    // A deep link into the landing page (e.g. /#journeys from the planner's
    // sidebar) is a deliberate visit: only the bare landing page redirects.
    if (hydrated && user && !window.location.hash) router.replace(to);
  }, [hydrated, user, router, to]);
  return null;
}
