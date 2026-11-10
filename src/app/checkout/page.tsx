import type { Metadata } from "next";
import { Checkout } from "@/components/app/Checkout";
import { AppShell } from "@/components/app/AppShell";
import "@/components/app/app.css";

export const metadata: Metadata = { title: "Review & pay | Tripweave" };

export default function CheckoutPage() {
  return (
    <AppShell>
      <Checkout />
    </AppShell>
  );
}
