import type { Metadata } from "next";
import { Checkout } from "@/components/app/Checkout";

export const metadata: Metadata = { title: "Review & pay | Tripweave" };

export default function CheckoutPage() {
  return <Checkout />;
}
