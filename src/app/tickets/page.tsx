import type { Metadata } from "next";
import { Tickets } from "@/components/app/Tickets";
import { AppShell } from "@/components/app/AppShell";
import "@/components/app/app.css";

export const metadata: Metadata = { title: "E-tickets | Tripweave" };

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ order?: string | string[] }> }) {
  const order = (await searchParams).order;
  return (
    <AppShell>
      <Tickets orderId={typeof order === "string" && order ? order : undefined} />
    </AppShell>
  );
}
