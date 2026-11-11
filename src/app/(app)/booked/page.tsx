import type { Metadata } from "next";
import { Booked } from "@/components/app/Booked";

export const metadata: Metadata = { title: "You’re going | Tripweave" };

export default function BookedPage() {
  return <Booked />;
}
