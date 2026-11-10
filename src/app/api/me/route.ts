import { authedUser } from "@/lib/supabase/authedUser";
import type { DemoUser } from "@/features/ui-mock/tripStore";

export const runtime = "nodejs";

export async function GET() {
  const { supabase, user } = await authedUser();
  if (!user) return Response.json({ user: null });

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const name = profile?.name || user.email?.split("@")[0] || "Traveller";
  const result: DemoUser = {
    name,
    firstName: name.split(" ")[0],
    email: user.email ?? "",
    avatar: profile?.avatar_url || "/images/a-1.webp",
    homeAirport: profile?.home_airport || "San Francisco (SFO)",
    memberSince: new Date(profile?.member_since ?? user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  };
  return Response.json({ user: result });
}
