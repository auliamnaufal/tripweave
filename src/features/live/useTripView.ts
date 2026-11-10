"use client";

import { useMemo } from "react";
import { planView, type PlanView } from "@/features/ui-mock/planView";
import { useTripPrefs } from "@/features/ui-mock/tripStore";
import { liveView, type LiveView } from "./adapter";
import { useLivePlan } from "./liveStore";

export type AnyTripView = PlanView | LiveView;

export function isLive(view: AnyTripView): view is LiveView {
  return "live" in view && view.live === true;
}

/** The real agent plan when one exists, otherwise the placeholder plan. */
export function useTripView(): AnyTripView {
  const prefs = useTripPrefs();
  const live = useLivePlan();
  return useMemo(() => (live ? liveView(live) : planView(prefs)), [live, prefs]);
}
