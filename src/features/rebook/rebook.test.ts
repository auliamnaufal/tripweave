import { describe, expect, it } from "vitest";
import type { TravelOffer } from "@/features/planner/travelOffer";
import { minorUnits, zonedDateTime } from "@/features/planner/types";
import { parseRebookFinalMessage } from "@/features/agent/rebookAgent";
import { itineraryTimeline } from "@/features/timeline/itineraryTimeline";
import { acceptedPicks, freedActivities, replacementCandidates } from "./rebook";

function offer(id: string, kind: TravelOffer["productKind"], startsAt: string, endsAt: string, cost: number): TravelOffer {
  return {
    id,
    supplier: "synthetic",
    supplierRef: id,
    productKind: kind,
    title: `Title ${id}`,
    summary: "",
    startsAt: zonedDateTime(startsAt),
    endsAt: zonedDateTime(endsAt),
    costMinorUnits: minorUnits(cost),
    currency: "USD",
    retrievedAt: "2026-11-01T00:00:00Z",
    expiresAt: "2026-12-01T00:00:00Z",
    cancellationTerms: null,
    synthetic: true,
  };
}

const flight = offer("fl", "flight", "2026-12-10T08:00:00+09:00", "2026-12-10T12:00:00+09:00", 50000);
const hotel = offer("ho", "hotel", "2026-12-10T15:00:00+09:00", "2026-12-14T11:00:00+09:00", 80000);
const tea = offer("tea", "activity", "2026-12-11T10:00:00+09:00", "2026-12-11T12:00:00+09:00", 6000);
const temple = offer("temple", "activity", "2026-12-12T09:00:00+09:00", "2026-12-12T11:00:00+09:00", 4000);
const trip = [flight, hotel, tea, temple];
const window = { startsAt: "2026-12-10T00:00:00+09:00", endsAt: "2026-12-14T23:59:00+09:00" };

const bookings = [
  { offerId: "fl", status: "booked", amountMinorUnits: 50000, refundStatus: null },
  { offerId: "ho", status: "booked", amountMinorUnits: 80000, refundStatus: null },
  { offerId: "tea", status: "failed", amountMinorUnits: 6000, refundStatus: "COMPLETED" },
  { offerId: "temple", status: "booked", amountMinorUnits: 4000, refundStatus: null },
];

describe("freedActivities", () => {
  it("returns refunded or failed activities with what was refunded", () => {
    expect(freedActivities(trip, bookings)).toEqual([{ offer: tea, refundMinorUnits: 6000, refunded: true }]);
  });

  it("ignores booked activities and anything that isn't an activity", () => {
    const failedFlight = bookings.map((b) => (b.offerId === "fl" ? { ...b, status: "failed" } : b.offerId === "tea" ? { ...b, status: "booked", refundStatus: null } : b));
    expect(freedActivities(trip, failedFlight)).toEqual([]);
  });
});

describe("replacementCandidates", () => {
  const freed = freedActivities(trip, bookings)[0];
  const freedIds = new Set(["tea"]);
  const sameDay = offer("sameday", "activity", "2026-12-11T13:00:00+09:00", "2026-12-11T15:00:00+09:00", 5000);
  const otherDay = offer("otherday", "activity", "2026-12-13T10:00:00+09:00", "2026-12-13T12:00:00+09:00", 3000);
  const tooDear = offer("dear", "activity", "2026-12-11T10:00:00+09:00", "2026-12-11T12:00:00+09:00", 9000);
  const clash = offer("clash", "activity", "2026-12-12T10:00:00+09:00", "2026-12-12T12:00:00+09:00", 2000);
  const outside = offer("outside", "activity", "2026-12-16T10:00:00+09:00", "2026-12-16T12:00:00+09:00", 2000);
  const catalog = [...trip, otherDay, sameDay, tooDear, clash, outside];

  it("keeps only activities that fit the slot, the dates and the refund, same day first", () => {
    const ids = replacementCandidates({ freed, tripOffers: trip, freedIds, catalog, travelWindow: window }).map((o) => o.id);
    expect(ids).toEqual(["sameday", "otherday"]);
  });

  it("can reuse the freed activity's own time, since it is no longer booked", () => {
    const sameSlot = offer("sameslot", "activity", "2026-12-11T10:30:00+09:00", "2026-12-11T11:30:00+09:00", 6000);
    const ids = replacementCandidates({ freed, tripOffers: trip, freedIds, catalog: [sameSlot], travelWindow: window }).map((o) => o.id);
    expect(ids).toEqual(["sameslot"]);
  });
});

describe("acceptedPicks", () => {
  const a = offer("a", "activity", "2026-12-11T13:00:00+09:00", "2026-12-11T15:00:00+09:00", 5000);
  const b = offer("b", "activity", "2026-12-13T10:00:00+09:00", "2026-12-13T12:00:00+09:00", 3000);
  const c = offer("c", "activity", "2026-12-13T16:00:00+09:00", "2026-12-13T17:00:00+09:00", 3000);
  const candidates = new Map([["tea", [a, b, c]]]);

  it("drops ids the server didn't offer, repeats, and anything past two per slot", () => {
    const picks = [
      { forOfferId: "tea", offerId: "made-up", reason: "x" },
      { forOfferId: "nope", offerId: "a", reason: "x" },
      { forOfferId: "tea", offerId: "a", reason: "  close by  " },
      { forOfferId: "tea", offerId: "a", reason: "again" },
      { forOfferId: "tea", offerId: "b", reason: "y" },
      { forOfferId: "tea", offerId: "c", reason: "z" },
    ];
    expect(acceptedPicks(picks, candidates).map(({ pick }) => [pick.offerId, pick.reason])).toEqual([
      ["a", "close by"],
      ["b", "y"],
    ]);
  });

  it("never suggests two overlapping activities for different slots", () => {
    const overlapping = offer("d", "activity", "2026-12-11T14:00:00+09:00", "2026-12-11T16:00:00+09:00", 1000);
    const twoHoles = new Map([
      ["tea", [a]],
      ["temple", [overlapping]],
    ]);
    const picks = [
      { forOfferId: "tea", offerId: "a", reason: "x" },
      { forOfferId: "temple", offerId: "d", reason: "y" },
    ];
    expect(acceptedPicks(picks, twoHoles).map(({ offer: o }) => o.id)).toEqual(["a"]);
  });
});

describe("rebook agent output", () => {
  it("parses the agent's JSON answer, fenced or not", () => {
    const text = '```json\n{"suggestions":[{"forOfferId":"tea","offerId":"a","reason":"Same afternoon."}],"note":"One fits."}\n```';
    expect(parseRebookFinalMessage(text)).toEqual({ suggestions: [{ forOfferId: "tea", offerId: "a", reason: "Same afternoon." }], note: "One fits." });
  });
});

describe("timeline with suggestions", () => {
  it("adds a suggested bar on the activity row, apart from the paid bars", () => {
    const model = itineraryTimeline({ offers: trip, violations: [] }, window, [], [
      {
        forOfferId: "tea",
        forTitle: "Title tea",
        refundMinorUnits: 6000,
        reason: "Same afternoon.",
        offer: { id: "a", title: "Garden walk", summary: "", startsAt: "2026-12-11T13:00:00+09:00", endsAt: "2026-12-11T15:00:00+09:00", costMinorUnits: 5000, platform: "Sample", synthetic: true },
      },
    ]);
    const bar = model.bars.find((b) => b.id === "suggested:a");
    expect(bar).toMatchObject({ resourceId: "activity", outcome: { state: "suggested", forTitle: "Title tea", reason: "Same afternoon." } });
    expect(model.bars.filter((b) => b.outcome?.state === "suggested")).toHaveLength(1);
  });
});
