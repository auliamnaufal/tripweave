import type { Metadata } from "next";
import { TripView } from "@/components/app/TripView";
import { AppShell } from "@/components/app/AppShell";
import "@/components/app/app.css";

export const metadata: Metadata = { title: "Your trip | Tripweave" };

export default function TripPage() {
  return (
    <AppShell>
      <TripView />
    </AppShell>
  );
}
