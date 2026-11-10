"use client";

import type { TripPrefs } from "@/features/ui-mock/destinations";
import { createClient } from "@/lib/supabase/client";
import { livePaymentStore, livePlanStore } from "@/features/live/liveStore";
import { docsStore, historyStore, ordersStore, savedStore, userStore, type DemoUser, type Order } from "@/features/ui-mock/tripStore";

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Pulls this signed-in user's data from Supabase into the local stores every screen already reads. */
export async function hydrateFromServer(): Promise<void> {
  const [me, orders, trips, saved] = await Promise.all([
    getJson<{ user: DemoUser | null }>("/api/me"),
    getJson<{ orders: Order[] }>("/api/orders"),
    getJson<{ history: { id: string; title: string; destId: string; at: string }[] }>("/api/trips"),
    getJson<{ saved: string[] }>("/api/saved"),
  ]);
  if (me?.user) userStore.set(me.user);
  if (orders) ordersStore.set(orders.orders);
  if (trips) historyStore.set(trips.history);
  if (saved) savedStore.set(saved.saved);
}

/** Clears every per-person local cache — call on sign-out so the next person on this browser starts clean. */
export function clearLocalUserData(): void {
  userStore.clear();
  ordersStore.clear();
  historyStore.clear();
  savedStore.clear();
  docsStore.clear();
  // The current plan and payment are personal too: the next person on this browser starts clean.
  livePlanStore.set(null);
  livePaymentStore.set(null);
}

export async function signOut(): Promise<void> {
  await createClient().auth.signOut();
  clearLocalUserData();
}

/** Fire-and-forget: persists a finished trip plan. Returns the new trip id, or null for a guest/failure. */
export async function syncTrip(input: {
  destId: string;
  title: string;
  prefs: TripPrefs;
  plan: unknown;
  isLive: boolean;
  source?: string;
  totalMinorUnits: number;
  budgetMinorUnits: number;
}): Promise<string | null> {
  try {
    const res = await fetch("/api/trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    if (!res.ok) return null;
    return ((await res.json()) as { id: string }).id;
  } catch {
    return null;
  }
}

/** Fire-and-forget: logs one chat turn. No-ops for guests. */
export function logChatMessage(input: { role: "user" | "agent"; kind?: string; text: string; tripId?: string | null }): void {
  void fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }).catch(() => {});
}

export function toggleSaved(destId: string, on: boolean): void {
  const req = on
    ? fetch("/api/saved", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destId }) })
    : fetch(`/api/saved?destId=${encodeURIComponent(destId)}`, { method: "DELETE" });
  void req.catch(() => {});
}
