import type { Metadata } from "next";
import { connection } from "next/server";
import { TripInsights } from "@/components/app/TripInsights";
import { buildInsights, type InsightsData } from "@/features/insights/insightsData";
import { listPaidQuotesWithBookings } from "@/features/quotes/quoteStore";
import { authedUser } from "@/lib/supabase/authedUser";

export const metadata: Metadata = { title: "Trip spend | Tripweave" };

export default async function InsightsPage() {
  // Per-user data read at request time, never prerendered.
  await connection();
  const { user } = await authedUser();
  let data: InsightsData = { trips: [], bookings: [] };
  let error: string | undefined;
  if (user) {
    try {
      data = buildInsights(await listPaidQuotesWithBookings(user.id));
    } catch (err) {
      console.error("[insights] load failed", err);
      error = "Your trips couldn't be loaded just now. Try again in a moment.";
    }
  }

  return <TripInsights data={data} error={error} licenseKey={process.env.AG_STUDIO_LICENSE_KEY || undefined} aiEnabled={Boolean(process.env.OPENAI_API_KEY)} />;
}
