import { createClient } from "./server";

/** The signed-in user for this request, or null — every /api route that touches user data starts here. */
export async function authedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}
