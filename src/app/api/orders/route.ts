import { authedUser } from "@/lib/supabase/authedUser";
import type { Order } from "@/features/ui-mock/tripStore";

export const runtime = "nodejs";

export async function GET() {
  const { supabase, user } = await authedUser();
  if (!user) return Response.json({ orders: [] satisfies Order[] });

  const { data, error } = await supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return Response.json({ error: "Could not load orders." }, { status: 500 });

  const orders: Order[] = (data ?? []).map((o) => ({
    id: o.label,
    title: o.title,
    destId: o.dest_id,
    total: o.total_minor_units / 100,
    at: o.created_at,
    items: o.items,
  }));
  return Response.json({ orders });
}
