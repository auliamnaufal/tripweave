"use client";

import { buildItinerary } from "@/features/planner/planner";
import { parseTripBrief } from "@/features/planner/tripBrief";
import { toTravelOffer, type ItineraryPlanView, type TravelOfferView } from "@/features/planner/travelOffer";
import type { PlanResult } from "@/features/quotes/planResult";
import { alternativesFor } from "@/features/suppliers/alternatives";
import type { CustomPlace, TripPrefs } from "@/features/ui-mock/destinations";
import { editPlan, streamPlan, type TripBriefWire } from "./client";
import { livePaymentStore, livePlanStore, type LivePlan } from "./liveStore";

// Editing a plan until it's paid, without a chat round trip or a spinner.
//
// A tap rebuilds the itinerary in the browser at once, with the same
// deterministic buildItinerary the server uses, from offers the server sent
// (`choices`). The edit is then saved in the background as a new quote; only
// that quote is ever paid, so checkout waits while `syncing` is set. Taps made
// while a save is in flight are batched into the next save (newest wins).

/** The LivePlan a server plan result becomes. */
export function fromPlanResult(result: PlanResult, base: { prefs: TripPrefs; brief: TripBriefWire; place?: CustomPlace }): LivePlan {
  return {
    prefs: base.prefs,
    brief: base.brief,
    plan: result.plan,
    note: result.note,
    source: result.source,
    retrievedAt: result.retrievedAt,
    quoteId: result.quoteId,
    comparisons: result.comparisons,
    deal: result.deal,
    alternatives: result.alternatives,
    activityOptions: result.activityOptions,
    choices: result.choices,
    ...(base.place ? { place: base.place } : {}),
  };
}

function offerPool(live: LivePlan): Map<string, TravelOfferView> {
  return new Map([...(live.choices ?? []), ...live.plan.offers].map((offer) => [offer.id, offer]));
}

const idsOf = (live: LivePlan) => live.plan.offers.map((offer) => offer.id);
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

/** The plan `offerIds` would make, and why it can't be paid if it can't (going over budget is allowed, and shown). */
export function previewEdit(live: LivePlan, offerIds: readonly string[]): { plan: ItineraryPlanView; blocked: string | null } | null {
  const pool = offerPool(live);
  const offers = offerIds.map((id) => pool.get(id));
  if (offers.some((offer) => !offer)) return null;
  const views = offers as TravelOfferView[];
  const plan = buildItinerary(parseTripBrief(live.brief), views.map(toTravelOffer));
  const clash = plan.violations.find((violation) => violation.kind !== "over-budget");
  let blocked: string | null = null;
  if (clash?.kind === "schedule-conflict") {
    const other = [clash.firstOfferId, clash.secondOfferId].map((id) => pool.get(id)?.title).find(Boolean);
    blocked = `Clashes with ${other ?? "another booking"}`;
  } else if (clash) {
    blocked = "Outside the trip dates";
  }
  return { plan: plan as ItineraryPlanView, blocked };
}

/** The plan as the server last saved it, to put back if an edit can't be saved. */
let lastSaved: LivePlan | null = null;

function apply(offerIds: string[]): string | null {
  const live = livePlanStore.get();
  if (!live?.quoteId) return "This plan needs a refresh before it can change.";
  const preview = previewEdit(live, offerIds);
  if (!preview) return "That option is no longer available.";
  if (preview.blocked) return preview.blocked;
  if (!live.syncing) lastSaved = live;
  const pool = [...offerPool(live).values()].map(toTravelOffer);
  livePlanStore.set({
    ...live,
    plan: preview.plan,
    alternatives: alternativesFor(preview.plan.offers.map(toTravelOffer), pool),
    syncing: true,
    syncError: undefined,
  });
  // Any PayPal order made for the old selection no longer matches what's on screen.
  livePaymentStore.set(null);
  void syncEdits();
  return null;
}

/** Swaps a flight leg or stay for another option on the same leg or dates. Returns why not, or null. */
export function swapChoice(fromOfferId: string, toOfferId: string): string | null {
  const live = livePlanStore.get();
  if (!live || fromOfferId === toOfferId || idsOf(live).includes(toOfferId)) return null;
  return apply(idsOf(live).map((id) => (id === fromOfferId ? toOfferId : id)));
}

/** Adds the activity if it isn't in the plan, removes it if it is. Returns why not, or null. */
export function toggleActivity(offerId: string): string | null {
  const live = livePlanStore.get();
  if (!live) return null;
  const ids = idsOf(live);
  return apply(ids.includes(offerId) ? ids.filter((id) => id !== offerId) : [...ids, offerId]);
}

/** Why an activity can't be added right now (a clash), or null. */
export function activityBlocker(live: LivePlan, offerId: string): string | null {
  const ids = idsOf(live);
  if (ids.includes(offerId)) return null;
  return previewEdit(live, [...ids, offerId])?.blocked ?? null;
}

let inflight: Promise<void> | null = null;

/** Saves pending edits; safe to call any time (e.g. after a reload mid-save). */
export function syncEdits(): Promise<void> {
  inflight ??= runSync().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function runSync(): Promise<void> {
  // Each round saves the newest selection; more taps during a save mean one more round.
  for (let round = 0; round < 8; round++) {
    const live = livePlanStore.get();
    if (!live?.syncing || !live.quoteId) return;
    const sent = idsOf(live);
    let result: PlanResult;
    try {
      result = await editPlan(live.quoteId, sent);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn’t save that change.";
      const now = livePlanStore.get();
      if (lastSaved && now) {
        livePlanStore.set({ ...lastSaved, syncing: false, syncError: `${message} Your plan is back to how it was.` });
        lastSaved = null;
      } else if (now) {
        // No saved copy to fall back to (the page was reloaded mid-save): keep paying blocked until a retry works.
        livePlanStore.set({ ...now, syncError: message });
      }
      return;
    }
    const now = livePlanStore.get();
    // Undo or a re-plan replaced the plan meanwhile: that plan has its own quote, so this save is moot.
    if (!now?.syncing) return;
    if (sameSet(idsOf(now), sent)) {
      livePlanStore.set({ ...fromPlanResult(result, now), syncing: false, syncError: undefined });
      lastSaved = null;
      return;
    }
    // Newer taps arrived while saving: build on the quote just saved and go again.
    livePlanStore.set({ ...now, quoteId: result.quoteId ?? now.quoteId });
  }
}

/**
 * Re-plans after the trip itself changed (dates, nights, travellers, budget):
 * a new search, so it takes a few seconds. `onStep` gets each step's label.
 */
export async function replan(brief: TripBriefWire, prefsPatch: Partial<TripPrefs>, onStep: (label: string) => void): Promise<void> {
  const live = livePlanStore.get();
  if (!live) throw new Error("There’s no plan to change.");
  const out: { result: PlanResult | null; failure: string } = { result: null, failure: "" };
  await streamPlan(brief, (event) => {
    if (event.kind === "tool-call") onStep(stepLabel[event.tool] ?? event.label);
    else if (event.kind === "plan") out.result = event;
    else if (event.kind === "error") out.failure = event.message;
  });
  if (!out.result) throw new Error(`${out.failure || "The planner didn’t return a plan."} Your current plan is unchanged.`);
  lastSaved = null;
  livePlanStore.set(fromPlanResult(out.result, { prefs: { ...live.prefs, ...prefsPatch }, brief, place: live.place }));
  livePaymentStore.set(null);
}

const stepLabel: Record<string, string> = {
  search_flights: "Searching real flight fares",
  search_hotels: "Comparing stays",
  search_activities: "Finding things to do",
  build_itinerary: "Checking totals and the schedule",
};
