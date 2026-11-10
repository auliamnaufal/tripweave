import type { Metadata } from "next";
import { Checkout } from "@/components/app/Checkout";
import "@/components/app/app.css";

export const metadata: Metadata = { title: "Review & pay | Tripweave" };

export default function CheckoutPage() {
  return <Checkout />;
}
