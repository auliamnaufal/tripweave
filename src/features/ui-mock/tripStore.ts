"use client";

import { useSyncExternalStore } from "react";
import { defaultPrefs, type TripPrefs } from "./destinations";
import { defaultDocSettings, type DocSettings, type TravelDoc } from "./documents";

// Tiny localStorage-backed stores so the planner, trip, checkout, booked and account
// screens share one demo state. Replace with real APIs when the agent is wired up.

function createStore<T>(key: string, fallback: T) {
  const listeners = new Set<() => void>();
  const fallbackRaw = JSON.stringify(fallback);
  let cachedRaw: string | null = null;
  let cachedValue: T = fallback;

  function read(): string {
    try {
      return window.localStorage.getItem(key) ?? fallbackRaw;
    } catch {
      return fallbackRaw;
    }
  }

  function getSnapshot(): T {
    const raw = read();
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      try {
        cachedValue = JSON.parse(raw) as T;
      } catch {
        cachedValue = fallback;
      }
    }
    return cachedValue;
  }

  function set(value: T) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage blocked: state stays in memory for this render */
    }
    listeners.forEach((l) => l());
  }

  function clear() {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => e.key === key && listener();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  function useValue(): T {
    return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
  }

  return { set, clear, useValue, get: getSnapshot };
}

export type DemoUser = {
  name: string;
  firstName: string;
  email: string;
  avatar: string;
  homeAirport: string;
  memberSince: string;
} | null;

export const DEMO_USER: NonNullable<DemoUser> = {
  name: "Mara Okafor",
  firstName: "Mara",
  email: "mara@example.com",
  avatar: "/images/a-1.webp",
  homeAirport: "San Francisco (SFO)",
  memberSince: "March 2026",
};

export const tripStore = createStore<TripPrefs>("tw-trip", defaultPrefs("oahu"));
export const userStore = createStore<DemoUser>("tw-user", null);
export type TripHistoryEntry = { id: string; title: string; destId: string; at: string };
export const historyStore = createStore<TripHistoryEntry[]>("tw-history", []);

export const useTripPrefs = tripStore.useValue;
export const useUser = userStore.useValue;
export const useHistory = historyStore.useValue;

const noopSubscribe = () => () => {};
/** True only after hydration, so screens that read localStorage render once with the right data. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export type Order = { id: string; title: string; destId: string; total: number; at: string; items: number };
export const ordersStore = createStore<Order[]>("tw-orders", []);
export const useOrders = ordersStore.useValue;

/** An order for this (destId, total) pairing already exists — every Pay button for this plan reads this, not just the trip page. */
export function tripPaidFor(orders: Order[], destId: string, total: number): boolean {
  return orders.some((o) => o.destId === destId && o.total === total);
}

/** One row in the "all your trips" list: a planned trip, a paid one, or (rarely) both merged into one. */
export type TripRow = { key: string; tripId: string | null; title: string; destId: string; at: string; paid: boolean; orderId: string | null; total: number | null };

/**
 * Every trip the traveller has, planned or paid, one row each. A trip never shows twice
 * under different labels, and a paid one is never mistaken for a draft.
 *
 * orders don't carry the trip id they came from (ponytail: `orders.trip_id` exists in the
 * schema but nothing writes it yet; add that once the capture route threads a trip id through,
 * then join on it instead). Until then this pairs each order to one not-yet-claimed history
 * entry for the same destination, oldest-planned-trip-per-destination first. Two concurrent
 * trips to the same destination can pair with the wrong one of each other cosmetically; the
 * order id and trip id each row carries are always the real ones, so Tickets and Itinerary
 * never point at the wrong trip.
 */
export function mergeTripRows(history: TripHistoryEntry[], orders: Order[]): TripRow[] {
  const unclaimed = [...history];
  const rows: TripRow[] = orders.map((o) => {
    const i = unclaimed.findIndex((h) => h.destId === o.destId);
    const h = i === -1 ? null : unclaimed.splice(i, 1)[0];
    return { key: o.id, tripId: h?.id ?? null, title: h?.title ?? o.title, destId: o.destId, at: o.at, paid: true, orderId: o.id, total: o.total };
  });
  for (const h of unclaimed) rows.push({ key: h.id, tripId: h.id, title: h.title, destId: h.destId, at: h.at, paid: false, orderId: null, total: null });
  return rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export const savedStore = createStore<string[]>("tw-saved", ["kyoto", "lisbon", "iceland"]);
export const useSaved = savedStore.useValue;

export const docsStore = createStore<TravelDoc[]>("tw-docs", []);
export const useDocs = docsStore.useValue;
export const docSettingsStore = createStore<DocSettings>("tw-doc-settings", defaultDocSettings);
export const useDocSettings = docSettingsStore.useValue;
