import type { Metadata } from "next";
import { TripView } from "@/components/app/TripView";
import "@/components/app/app.css";

export const metadata: Metadata = { title: "Your trip | Tripweave" };

export default function TripPage() {
  return <TripView />;
}
