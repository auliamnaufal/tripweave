import { Suspense } from "react";
import type { Metadata } from "next";
import { Planner } from "@/components/app/Planner";
import "@/components/app/app.css";
import "@/components/app/planner.css";

export const metadata: Metadata = { title: "Planner | Tripweave" };

export default function PlanPage() {
  return (
    <Suspense fallback={null}>
      <Planner />
    </Suspense>
  );
}
