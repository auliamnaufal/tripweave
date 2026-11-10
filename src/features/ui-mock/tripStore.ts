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
export const historyStore = createStore<{ id: string; title: string; destId: string; at: string }[]>("tw-history", []);

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

export const savedStore = createStore<string[]>("tw-saved", ["kyoto", "lisbon", "iceland"]);
export const useSaved = savedStore.useValue;

export const docsStore = createStore<TravelDoc[]>("tw-docs", []);
export const useDocs = docsStore.useValue;
export const docSettingsStore = createStore<DocSettings>("tw-doc-settings", defaultDocSettings);
export const useDocSettings = docSettingsStore.useValue;
