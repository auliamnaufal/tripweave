import type { Metadata } from "next";
import { Booked } from "@/components/app/Booked";
import { AppShell } from "@/components/app/AppShell";
import "@/components/app/app.css";

export const metadata: Metadata = { title: "You’re going | Tripweave" };

export default function BookedPage() {
  return (
    <AppShell>
      <Booked />
    </AppShell>
  );
}
