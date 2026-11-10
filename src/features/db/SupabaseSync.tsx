"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearLocalUserData, hydrateFromServer } from "./sync";

/** Mounted once in the root layout: keeps the local stores in step with Supabase auth state. */
export function SupabaseSync() {
  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void hydrateFromServer();
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") void hydrateFromServer();
      if (event === "SIGNED_OUT") clearLocalUserData();
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  return null;
}
