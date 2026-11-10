"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearLocalUserData, hydrateFromServer } from "./sync";
import { userStore } from "@/features/ui-mock/tripStore";

/** Mounted once in the root layout: keeps the local stores in step with Supabase auth state. */
export function SupabaseSync() {
  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void hydrateFromServer();
      // Signed-in-looking leftovers with no session behind them (expired, or
      // signed out in another tab): clear them so the UI never claims a
      // session the server doesn't have.
      else if (userStore.get()) clearLocalUserData();
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") void hydrateFromServer();
      if (event === "SIGNED_OUT") clearLocalUserData();
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  return null;
}
