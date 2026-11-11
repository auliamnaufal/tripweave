"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AppTopbar } from "@/components/app/AppTopbar";
import { Icon } from "@/components/brand/Icon";
import type { InsightsData } from "@/features/insights/insightsData";
import "./trip-insights.css";

const TripInsightsStudio = dynamic(() => import("@/components/app/TripInsightsStudio"), {
  ssr: false,
  loading: () => <div className="ti-skeleton" aria-busy="true" />,
});

type Props = { data: InsightsData; licenseKey?: string; aiEnabled: boolean; error?: string };

/** Trip spend: every paid Trip Order and where its PayPal payment went, on AG Studio. */
export function TripInsights({ data, licenseKey, aiEnabled, error }: Props) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const empty = data.trips.length === 0;

  return (
    <div className="ti-page">
      <AppTopbar back={{ href: "/trip", label: "Current trip" }} />
      <main className="ti-wrap">
        <header className="ti-head">
          <div>
            <p className="ti-kicker mono">Trip spend</p>
            <h1 className="display">Where your PayPal payments went</h1>
            <p className="ti-sub">
              Every Trip Order you paid with PayPal, line by line: what was booked, what came back to your PayPal, and whether it adds up.
              {aiEnabled && " Ask the assistant, or edit the dashboard yourself."}
            </p>
          </div>
          {!empty && (
            <div className="ti-actions" role="group" aria-label="Dashboard mode">
              <button type="button" className={`chip ${mode === "view" ? "is-on" : ""}`} aria-pressed={mode === "view"} onClick={() => setMode("view")}>
                View
              </button>
              <button type="button" className={`chip ${mode === "edit" ? "is-on" : ""}`} aria-pressed={mode === "edit"} onClick={() => setMode("edit")}>
                <Icon name="spark" size={14} /> Edit &amp; ask AI
              </button>
            </div>
          )}
        </header>

        {error ? (
          <p className="ti-empty" role="alert">
            {error}
          </p>
        ) : empty ? (
          <div className="ti-empty">
            <Icon name="wallet" size={22} />
            <p>No paid trips yet. Once you pay for a plan with PayPal, its bookings and any refunds show up here.</p>
            <Link href="/plan" className="btn">
              Plan a trip
            </Link>
          </div>
        ) : (
          // Switching mode keeps the report as it is: Studio only changes what is editable.
          <div className="ti-canvas">
            <TripInsightsStudio data={data} licenseKey={licenseKey} aiEnabled={aiEnabled} mode={mode} />
          </div>
        )}
      </main>
    </div>
  );
}
