"use client";

import { useSyncExternalStore } from "react";
import type { ItineraryPlanView } from "@/features/planner/travelOffer";
import type { ProductComparison } from "@/features/suppliers/compare";
import type { DealSummary } from "@/features/suppliers/deal";
import type { TripPrefs } from "@/features/ui-mock/destinations";
import type { OrderResult, TripBriefWire } from "./client";

// The last real plan the agent returned, and the PayPal order for it. Kept in
// localStorage so /trip, /checkout and /booked show the same itinerary.

export type LivePlan = {
  prefs: TripPrefs;
  brief: TripBriefWire;
  plan: ItineraryPlanView;
  note: string;
  source: string;
  retrievedAt: string;
  /** Server-held priced snapshot; checkout pays this, never the offers above. */
  quoteId?: string;
  /** Same products priced on other platforms (see suppliers/compare.ts). */
  comparisons?: ProductComparison[];
  /** What the deal hunt found for this plan (platforms, savings, tips), computed by the server. */
  deal?: DealSummary;
};

export type LivePayment = OrderResult & { planRetrievedAt: string };

function store<T>(key: string) {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let cached: T | null = null;
  const read = () => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const get = (): T | null => {
    const raw = read();
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      try {
        cached = raw ? (JSON.parse(raw) as T) : null;
      } catch {
        cached = null;
      }
    }
    return cached;
  };
  const write = (value: T | null) => {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage blocked */
    }
    listeners.forEach((l) => l());
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    const onStorage = (e: StorageEvent) => e.key === key && l();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  };
  const use = () => useSyncExternalStore(subscribe, get, () => null);
  return { get, set: write, use };
}

export const livePlanStore = store<LivePlan>("tw-live-plan");
export const livePaymentStore = store<LivePayment>("tw-live-payment");
export const useLivePlan = livePlanStore.use;
export const useLivePayment = livePaymentStore.use;
