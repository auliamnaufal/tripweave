"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LogoMark } from "@/components/brand/Logo";
import { Icon, type IconName } from "@/components/brand/Icon";
import { usd } from "@/features/ui-mock/data";
import {
  buildPlan,
  defaultPrefs,
  destinations,
  findDestination,
  fitToBudget,
  flightTotal,
  getDestination,
  registerCustomDestination,
  type CustomPlace,
  type Destination,
  type TripPrefs,
} from "@/features/ui-mock/destinations";
import { acknowledgements, applyAnswer, planSummary, questions, suggestionsFor, type QuestionId } from "@/features/ui-mock/agentScript";
import { docsStore, historyStore, savedStore, tripPaidFor, tripStore, useDocs, useHydrated, useOrders, useSaved, useUser } from "@/features/ui-mock/tripStore";
import { tabKeys } from "@/components/app/tabKeys";
import {
  blockers,
  docIntent,
  docMeta,
  docStatus,
  findDoc,
  fmtDate,
  fmtSize,
  guessKind,
  readDocument,
  readiness,
  upsertDoc,
  validateFile,
  type DocIntent,
  type DocKind,
  type TravelDoc,
} from "@/features/ui-mock/documents";
import { DocChecklist, useDocPicker } from "@/components/app/TravelDocs";
import { DealLine } from "@/components/app/DealPanel";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { briefFromPrefs, homeOrigin, readTrip, streamPlan, type TripBriefWire } from "@/features/live/client";
import { ActivityOptions, EditStatus, LiveOptions } from "@/components/app/LiveOptions";
import { fromPlanResult, swapChoice } from "@/features/live/planEditor";
import { AppSidebar, MobileNav, useSidebarCollapsed } from "@/components/app/AppSidebar";
import { ChatSkeleton, PlannerSkeleton } from "@/components/app/PlannerSkeleton";
import { AccountMenu } from "@/components/app/AccountMenu";
import type { AlternativeSlot } from "@/features/suppliers/alternatives";
import { livePaymentStore, livePlanStore, useLivePlan, type LivePlan } from "@/features/live/liveStore";
import { liveView, overlayLive, type LiveView } from "@/features/live/adapter";
import { hydrateFromServer, loadChatHistory, loadTrip, logChatMessage, syncTrip } from "@/features/db/sync";

type StepStatus = "pending" | "running" | "done";
type Step = { id: string; tool: string; label: string; status: StepStatus; result?: string; preview?: "flights" | "hotels" | "activities" };

type Block =
  | { id: string; role: "user"; text: string; file?: { name: string; size: number } }
  | { id: string; role: "agent"; kind: "typing" }
  | { id: string; role: "agent"; kind: "docs" }
  | { id: string; role: "agent"; kind: "text"; text: string; streaming: boolean }
  | { id: string; role: "agent"; kind: "question"; qid: QuestionId; text: string; options: string[]; multi: boolean; done: boolean; picked: string[] }
  | { id: string; role: "agent"; kind: "brief" }
  | { id: string; role: "agent"; kind: "work"; title: string; steps: Step[]; done: boolean }
  | { id: string; role: "agent"; kind: "flights" | "hotels" | "food" | "days" | "plan" | "places" };


const toolIcon: Record<string, IconName> = {
  search_flights: "plane",
  search_hotels: "bed",
  search_activities: "compass",
  check_budget: "wallet",
  build_itinerary: "calendar",
  search_food: "leaf",
  read_document: "file",
  check_validity: "calendar",
  save_document: "lock",
};

const liveToolTitle: Record<string, string> = {
  search_flights: "Searching real flight fares",
  search_hotels: "Comparing stays",
  search_activities: "Finding things to do",
  build_itinerary: "Checking totals and the schedule",
};
const liveStage: Record<string, number> = { search_flights: 1, search_hotels: 2, search_activities: 3, build_itinerary: 4 };

function liveSummary(v: LiveView): string {
  const under = v.budget - v.total;
  const line = under >= 0 ? `${usd.format(under)} under your line` : `${usd.format(-under)} over your line`;
  return `${v.note} All in: ${usd.format(v.total)} for ${v.travelers}, ${line}. Flights are live test-mode fares from Duffel; the stay and activities come from our sample catalog.`;
}

function liveSuggestions(last: string, place: string): string[] {
  const s: string[] = [];
  if (["hotel-cheaper", "flight-cheaper", "flight-faster", "rest", "other", "hotel-pick"].includes(last)) s.push("Undo that");
  if (last !== "hotel-cheaper") s.push("Make the hotel cheaper");
  if (!last.startsWith("flight")) s.push("Find a cheaper flight");
  if (last !== "food") s.push(`Where should we eat in ${place}?`);
  if (last !== "rest") s.push("Add a rest day");
  return s.slice(0, 4);
}

let uid = 0;
const session = Math.random().toString(36).slice(2, 7);
const nid = () => `b${session}${++uid}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pickRandom = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const stamp = () => ({ id: String(Date.now()), at: new Date().toISOString() });

export function Planner() {
  const params = useSearchParams();
  const router = useRouter();
  const user = useUser();
  const hydrated = useHydrated();
  const ready = hydrated && !!user;
  const firstName = user?.firstName ?? "there";

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [prefs, setPrefs] = useState<TripPrefs | null>(null);
  const [prevPrefs, setPrevPrefs] = useState<TripPrefs | null>(null);
  const [qIndex, setQIndex] = useState<number | null>(null);
  const [planned, setPlanned] = useState(false);
  const [busy, setBusy] = useState(false);
  // True only while opening a trip from "Recent plans" or a resume link, so the welcome
  // screen doesn't flash behind the fetch and read like a new chat instead of a loading one.
  const [resuming, setResuming] = useState(false);
  const [stage, setStage] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [panelTab, setPanelTab] = useState<"overview" | "todo" | "map">("overview");
  const [panelOpen, setPanelOpen] = useState(false);
  // Shared with every app page, so the sidebar keeps its shape as you move around.
  const collapsed = useSidebarCollapsed();
  const [dragging, setDragging] = useState(false);
  const docs = useDocs();
  const saved = useSaved();
  const [announce, setAnnounce] = useState("");
  const docUndo = useRef<TravelDoc | null>(null);

  const root = useRef<HTMLDivElement>(null);
  const planChip = useRef<HTMLButtonElement>(null);
  const panelClose = useRef<HTMLButtonElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const prefsRef = useRef<TripPrefs | null>(null);
  const alive = useRef(true);
  const started = useRef(false);
  // The DB row for the trip currently being planned, once syncTrip() has returned one.
  const tripIdRef = useRef<string | null>(null);
  // Messages logged before tripIdRef is known: held here, then flushed with the real id once
  // syncTrip() resolves, so no chat turn is ever persisted unlinked from its trip.
  const pendingChat = useRef<{ role: "user" | "agent"; kind?: string; text: string }[]>([]);

  const live = useLivePlan();
  const prevLive = useRef<LivePlan | null>(null);
  const lastLiveError = useRef("");
  const dest = prefs ? getDestination(prefs.destId) : null;
  const lv = useMemo(() => (live && prefs && live.prefs.destId === prefs.destId ? liveView(live) : null), [live, prefs]);
  const plan = useMemo(() => (prefs ? overlayLive(buildPlan(prefs), lv) : null), [prefs, lv]);
  // Same (destId, total) match TripView.tsx uses: once an order exists for this plan, every Pay button for it shows paid, not just the trip page.
  const orders = useOrders();
  const paid = plan ? tripPaidFor(orders, plan.prefs.destId, plan.totals.total) : false;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (panelOpen) panelClose.current?.focus();
  }, [panelOpen]);

  function closePanel() {
    setPanelOpen(false);
    planChip.current?.focus();
  }

  useEffect(() => {
    prefsRef.current = prefs;
    if (prefs && planned) tripStore.set(prefs);
  }, [prefs, planned]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [blocks, suggestions]);

  useGSAP(
    () => {
      if (!ready || prefersReducedMotion()) return;
      // The sidebar is already on screen in the skeleton, so only the welcome animates in.
      gsap.from(".pl-welcome > *", { y: 28, opacity: 0, stagger: 0.07, duration: 1.1, ease: "expo.out", delay: 0.1 });
      gsap.from(".pl-place", { y: 30, opacity: 0, stagger: 0.05, duration: 1, ease: "expo.out", delay: 0.35 });
    },
    { scope: root, dependencies: [ready] },
  );

  function logChat(entry: { role: "user" | "agent"; kind?: string; text: string }) {
    const tripId = tripIdRef.current;
    if (tripId) logChatMessage({ ...entry, tripId });
    else pendingChat.current.push(entry);
  }

  /** Called once syncTrip() resolves: attaches every buffered turn to the now-known trip. */
  function flushPendingChat(tripId: string) {
    const pending = pendingChat.current;
    pendingChat.current = [];
    for (const entry of pending) logChatMessage({ ...entry, tripId });
  }

  /**
   * Saves the trip's current prefs/plan: creates the row the first time (makePlan),
   * updates the same row on every refinement after, so edits made while continuing
   * a resumed chat actually stick instead of only living in this tab's memory.
   */
  function persistTrip(p: TripPrefs, planData: unknown, isLive: boolean, totalMinorUnits: number, source?: string) {
    const d = getDestination(p.destId);
    void syncTrip({
      id: tripIdRef.current ?? undefined,
      destId: p.destId,
      title: `${d.name}, ${p.nights} nights`,
      prefs: p,
      plan: planData,
      isLive,
      source,
      totalMinorUnits,
      budgetMinorUnits: Math.round(p.budget * 100),
    }).then((id) => {
      if (!id) return;
      tripIdRef.current = id;
      flushPendingChat(id);
      // historyStore's entry for a just-created trip starts with a client-fabricated id
      // (makePlan hasn't heard back from the server yet) — swap in the real one the moment
      // it's known, so clicking "Recent plans" right away resumes it instead of 400ing.
      const hist = historyStore.get();
      const i = hist.findIndex((x) => x.destId === p.destId);
      if (i !== -1 && hist[i].id !== id) historyStore.set(hist.map((x, k) => (k === i ? { ...x, id } : x)));
    });
  }

  const push = useCallback((b: Block) => {
    if (b.role === "user" && b.text) logChat({ role: "user", text: b.text });
    setBlocks((prev) => [...prev, b]);
  }, []);
  const patch = useCallback(
    (id: string, fn: (b: Block) => Block) => setBlocks((prev) => prev.map((b) => (b.id === id ? fn(b) : b))),
    [],
  );
  const remove = useCallback((id: string) => setBlocks((prev) => prev.filter((b) => b.id !== id)), []);

  const updatePrefs = useCallback((next: TripPrefs | null) => {
    prefsRef.current = next;
    setPrefs(next);
  }, []);

  async function say(text: string, typingMs = 650) {
    logChat({ role: "agent", kind: "text", text });
    const tid = nid();
    push({ id: tid, role: "agent", kind: "typing" });
    await sleep(typingMs);
    if (!alive.current) return;
    remove(tid);
    const id = nid();
    push({ id, role: "agent", kind: "text", text: "", streaming: true });
    const words = text.split(" ");
    for (let i = 1; i <= words.length; i++) {
      if (!alive.current) return;
      patch(id, (b) => (b.role === "agent" && b.kind === "text" ? { ...b, text: words.slice(0, i).join(" ") } : b));
      await sleep(22);
    }
    patch(id, (b) => (b.role === "agent" && b.kind === "text" ? { ...b, streaming: false } : b));
    setAnnounce(text);
  }

  async function runWork(title: string, steps: { tool: string; label: string; result: () => string; ms: number; preview?: Step["preview"] }[], onStep?: (i: number) => void) {
    const id = nid();
    push({ id, role: "agent", kind: "work", title, done: false, steps: steps.map((s, i) => ({ id: `${id}-${i}`, tool: s.tool, label: s.label, status: "pending", preview: s.preview })) });
    for (const [i, s] of steps.entries()) {
      patch(id, (b) => (b.role === "agent" && b.kind === "work" ? { ...b, steps: b.steps.map((x, k) => (k === i ? { ...x, status: "running" } : x)) } : b));
      await sleep(s.ms);
      if (!alive.current) return;
      patch(id, (b) => (b.role === "agent" && b.kind === "work" ? { ...b, steps: b.steps.map((x, k) => (k === i ? { ...x, status: "done", result: s.result() } : x)) } : b));
      onStep?.(i + 1);
      await sleep(180);
    }
    patch(id, (b) => (b.role === "agent" && b.kind === "work" ? { ...b, done: true } : b));
  }

  /** Streams the real planner agent into a work card. Returns null if it fails. */
  async function runLiveAgent(title: string, p: TripPrefs, brief: TripBriefWire, place?: CustomPlace): Promise<LivePlan | null> {
    const id = nid();
    let n = 0;
    const step = (tool: string, label: string): Step => ({ id: `${id}-${n++}`, tool, label, status: "running" });
    push({ id, role: "agent", kind: "work", title, done: false, steps: [step("plan_trip", "Sending your brief to the agent")] });
    const update = (fn: (steps: Step[]) => Step[]) =>
      patch(id, (b) => (b.role === "agent" && b.kind === "work" ? { ...b, steps: fn(b.steps) } : b));
    const out: { plan: LivePlan | null; failure: string } = { plan: null, failure: "" };
    try {
      await streamPlan(brief, (event) => {
        if (!alive.current) return;
        if (event.kind === "tool-call") {
          update((steps) => [
            ...steps.map((s) => (s.tool === "plan_trip" && s.status === "running" ? { ...s, status: "done" as const, result: "The agent is on it" } : s)),
            step(event.tool, liveToolTitle[event.tool] ?? event.label),
          ]);
        } else if (event.kind === "tool-result") {
          update((steps) => {
            const i = steps.findLastIndex((s) => s.tool === event.tool && s.status === "running");
            if (i === -1) return steps;
            const next = [...steps];
            next[i] = { ...next[i], status: "done", result: event.summary };
            return next;
          });
          setStage((s) => Math.max(s, liveStage[event.tool] ?? s));
        } else if (event.kind === "plan") {
          out.plan = fromPlanResult(event, { prefs: p, brief, place });
        } else if (event.kind === "error") {
          out.failure = event.message;
        }
      });
    } catch (e) {
      out.failure = e instanceof Error ? e.message : "The planner is unavailable.";
    }
    update((steps) => steps.map((s) => (s.status === "running" ? { ...s, status: "done", result: out.plan ? s.result ?? "Done" : "Stopped" } : s)));
    patch(id, (b) => (b.role === "agent" && b.kind === "work" ? { ...b, done: true, title: out.plan ? b.title : "Live planner unavailable" } : b));
    if (out.plan) {
      setStage(5);
      livePlanStore.set(out.plan);
    } else {
      lastLiveError.current = out.failure || "no plan returned";
    }
    return out.plan;
  }

  /** Points prefs.hotelIdx at the stay the agent chose, so the stay cards highlight it. */
  function syncHotel(p: TripPrefs, result: LivePlan): TripPrefs {
    const d = getDestination(p.destId);
    const idx = d.hotels.findIndex((h) => result.plan.offers.some((o) => o.id === `hotel-${h.id}`));
    const next = idx >= 0 ? { ...p, hotelIdx: idx } : p;
    updatePrefs(next);
    return next;
  }

  async function askQuestion(i: number, d: Destination, p: TripPrefs) {
    const q = questions[i];
    const tid = nid();
    push({ id: tid, role: "agent", kind: "typing" });
    await sleep(550);
    remove(tid);
    const ask = q.ask(d, p);
    push({ id: nid(), role: "agent", kind: "question", qid: q.id, text: ask, options: q.options, multi: !!q.multi, done: false, picked: [] });
    setAnnounce(ask);
    setQIndex(i);
  }

  async function start(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setSuggestions([]);
    // Every new-conversation entry point routes through here, so this is the one place
    // that needs to drop any trip id/buffer left over from a previous conversation.
    tripIdRef.current = null;
    pendingChat.current = [];
    push({ id: nid(), role: "user", text: value });
    const exact = destinations.find((x) => x.name.toLowerCase() === value.toLowerCase());
    const d = value.toLowerCase().includes("surprise") ? pickRandom(destinations) : exact;
    if (!d) {
      await planFromText(value);
      return;
    }
    // Fly from the traveller's saved home airport, not a hard-coded city.
    const p = { ...defaultPrefs(d.id), origin: user?.homeAirport ? homeOrigin(user.homeAirport).city : defaultPrefs(d.id).origin };
    updatePrefs(p);
    setStage(0);
    await say(`${d.name}, good choice. ${d.blurb} A few quick questions so I search for the right things.`);
    await askQuestion(0, d, p);
    setBusy(false);
  }

  /**
   * Anything typed ("Japan: Tokyo day 1, Osaka day 2, Mount Fuji day 3") goes
   * to the intake agent, which turns it into a route and a brief; then the
   * deal-hunting agent plans it like any other trip. No scripted questions.
   */
  async function planFromText(text: string) {
    const tid = nid();
    push({ id: tid, role: "agent", kind: "typing" });
    const home = homeOrigin(user?.homeAirport);
    let result: Awaited<ReturnType<typeof readTrip>>;
    try {
      result = await readTrip(text, { origin: home, travelers: 2, budgetUsd: 4000 });
    } catch (error) {
      remove(tid);
      await say(error instanceof Error ? error.message : "I couldn’t read that request.");
      setBusy(false);
      return;
    }
    remove(tid);
    if (result.kind === "clarify") {
      await say(result.question);
      push({ id: nid(), role: "agent", kind: "places" });
      setBusy(false);
      return;
    }
    const { brief, summary, stops } = result;
    const route = stops.map((stop) => stop.city).filter((city, i, all) => i === 0 || all[i - 1] !== city);
    const single = stops.length === 1 ? destinations.find((x) => x.name.toLowerCase() === stops[0].city.toLowerCase()) : undefined;
    let place: CustomPlace | undefined;
    if (!single) {
      place = {
        id: `custom-${route.join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: route.join(" · "),
        country: stops[0].country,
        airport: "",
        route,
      };
      registerCustomDestination(place);
    }
    const destId = single?.id ?? place!.id;
    const nights = stops.reduce((sum, stop) => sum + stop.nights, 0);
    const start = new Date(brief.travelWindow.startsAt);
    const p: TripPrefs = {
      ...defaultPrefs(destId),
      destId,
      origin: brief.origin.city,
      nights,
      travelers: brief.travelers,
      travelerLabel: brief.travelers === 1 ? "Just me" : brief.travelers === 2 ? "Two of us" : `${brief.travelers} of us`,
      budget: Math.round(brief.hardBudget.amountMinorUnits / 100),
      vibes: brief.preferences,
      when: start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    };
    updatePrefs(p);
    setStage(0);
    await say(`${summary} I’ll search every partner platform for the best deal on each part.`);
    await makePlan(p, brief, place);
  }

  async function answer(qid: QuestionId, value: string) {
    const p = prefsRef.current;
    if (!p || busy) return;
    const d = getDestination(p.destId);
    setBusy(true);
    setBlocks((prev) => prev.map((b) => (b.role === "agent" && b.kind === "question" && b.qid === qid ? { ...b, done: true, picked: value.split(", ") } : b)));
    push({ id: nid(), role: "user", text: value });
    const next = applyAnswer(p, qid, value, d);
    updatePrefs(next);
    const i = questions.findIndex((q) => q.id === qid);
    if (i < questions.length - 1) {
      const tid = nid();
      push({ id: tid, role: "agent", kind: "typing" });
      await sleep(450);
      remove(tid);
      push({ id: nid(), role: "agent", kind: "text", text: acknowledgements[qid](value, d), streaming: false });
      await askQuestion(i + 1, d, next);
      setBusy(false);
    } else {
      setQIndex(null);
      await makePlan(next);
    }
  }

  async function makePlan(input: TripPrefs, briefOverride?: TripBriefWire, place?: CustomPlace) {
    let p = input;
    setBusy(true);
    setQIndex(null);
    const d = getDestination(p.destId);
    await say("Here’s what I heard. I’ll start searching now.", 400);
    push({ id: nid(), role: "agent", kind: "brief" });
    await sleep(300);
    livePlanStore.set(null);
    livePaymentStore.set(null);
    prevLive.current = null;
    const liveResult = await runLiveAgent(`Planning ${d.name}`, p, briefOverride ?? briefFromPrefs(p), place);
    if (!alive.current) return;
    if (liveResult) {
      p = syncHotel(p, liveResult);
      setPlanned(true);
      tripStore.set(p);
      const hl = historyStore.get();
      const stl = stamp();
      historyStore.set([{ id: `${p.destId}-${stl.id}`, title: `${d.name}, ${p.nights} nights`, destId: d.id, at: stl.at }, ...hl.filter((x) => x.destId !== d.id)].slice(0, 6));
      persistTrip(p, liveResult, true, Math.round(liveView(liveResult).total * 100), liveResult.source);
      await say(liveSummary(liveView(liveResult)), 300);
      push({ id: nid(), role: "agent", kind: "flights" });
      await sleep(250);
      push({ id: nid(), role: "agent", kind: "hotels" });
      await sleep(250);
      push({ id: nid(), role: "agent", kind: "plan" });
      await askForDocs(p);
      if (!alive.current) return;
      setSuggestions(withDocSuggestions(p, liveSuggestions("plan", d.name)));
      setBusy(false);
      return;
    }
    await say(`I couldn’t reach the live planner (${lastLiveError.current}), so here’s a sample plan from demo data instead.`, 300);
    const fit = fitToBudget(p);
    p = fit.prefs;
    updatePrefs(p);
    const pl = buildPlan(p);
    await runWork(
      `Planning ${d.name}`,
      [
        { tool: "search_flights", label: `Searching flights ${pl.originCode} → ${d.airport}`, ms: 1300, preview: "flights", result: () => `${d.flights.length} good options · best: ${pl.flight.airline}` },
        { tool: "search_hotels", label: `Comparing stays in ${d.name}`, ms: 1200, preview: "hotels", result: () => `${d.hotels.length} shortlisted · picked ${pl.hotel.name}` },
        { tool: "search_activities", label: `Finding things to do for “${p.vibes.join(", ").toLowerCase()}”`, ms: 1100, preview: "activities", result: () => `${pl.activities.length} activities fit your pace` },
        { tool: "check_budget", label: `Checking against your ${usd.format(p.budget)} line`, ms: 800, result: () => `${usd.format(pl.totals.total)} · ${pl.underBy >= 0 ? `${usd.format(pl.underBy)} under` : `${usd.format(-pl.underBy)} over`}` },
        { tool: "build_itinerary", label: "Writing your day-by-day", ms: 900, result: () => `${pl.days.length} days · no overlaps` },
      ],
      setStage,
    );
    if (!alive.current) return;
    setPlanned(true);
    tripStore.set(p);
    const h = historyStore.get();
    const st = stamp();
    historyStore.set([{ id: `${p.destId}-${st.id}`, title: `${d.name}, ${p.nights} nights`, destId: d.id, at: st.at }, ...h.filter((x) => x.destId !== d.id)].slice(0, 6));
    persistTrip(p, pl, false, Math.round(pl.totals.total * 100));
    await say(planSummary(pl, fit.adjusted), 300);
    push({ id: nid(), role: "agent", kind: "flights" });
    await sleep(250);
    push({ id: nid(), role: "agent", kind: "hotels" });
    await sleep(250);
    push({ id: nid(), role: "agent", kind: "plan" });
    await askForDocs(p);
    if (!alive.current) return;
    setSuggestions(withDocSuggestions(p, suggestionsFor(pl, "plan")));
    setBusy(false);
  }

  function withDocSuggestions(p: TripPrefs, base: string[]) {
    return blockers(p, docsStore.get()).length ? [...base.slice(0, 3), "How are my documents kept private?"] : base;
  }

  async function askForDocs(p: TripPrefs) {
    const current = docsStore.get();
    const missing = blockers(p, current);
    const onFile = readiness(p, current).filter((r) => r.doc && r.status === "ok");
    await sleep(350);
    if (!alive.current) return;
    if (missing.length === 0) {
      const names = onFile.map((r) => `${docMeta[r.req.kind].short.toLowerCase()} ending ${r.doc!.last4}`);
      await say(
        names.length
          ? `Your ${joinList(names)} ${names.length > 1 ? "are" : "is"} already on file, so checkout is one tap. Here’s what this trip needs:`
          : "Nothing extra is required for this trip. Here’s the checklist anyway:",
        400,
      );
    } else {
      const items = missing.map((r) => `${docMeta[r.req.kind].label.toLowerCase()}${r.status === "missing" ? "" : " (the one on file expires too soon)"}`);
      await say(`One last thing before you pay: the airline and hotel need your ${joinList(items)}. Upload it here once and I’ll keep it in Travel documents, so next time you skip this step.`, 400);
    }
    push({ id: nid(), role: "agent", kind: "docs" });
  }

  async function uploadDoc(file: File, expected?: DocKind, expectedTraveler?: number) {
    if (busy) return;
    setBusy(true);
    setSuggestions([]);
    docUndo.current = null;
    push({ id: nid(), role: "user", text: "", file: { name: file.name, size: file.size } });
    const problem = validateFile(file);
    if (problem) {
      await say(problem, 350);
      setBusy(false);
      return;
    }
    const p = planned ? prefsRef.current : null;
    const current = docsStore.get();
    const firstOpen = p ? blockers(p, current)[0] ?? readiness(p, current).find((r) => r.status !== "ok") : undefined;
    const kind = expected ?? guessKind(file.name, firstOpen?.req.kind ?? "passport");
    const travelerIndex = expectedTraveler ?? firstOpen?.req.travelerIndex ?? 0;
    const holder = travelerIndex === 0 ? user?.name ?? "Traveller" : `Traveller ${travelerIndex + 1}`;
    const doc = readDocument({ kind, fileName: file.name, fileSize: file.size, holder, prefs: p, source: "chat", travelerIndex });
    const status = docStatus(doc, p);
    const label = docMeta[kind].label;
    await runWork(`Reading your ${label.toLowerCase()}`, [
      { tool: "read_document", label: `Reading ${file.name}`, ms: 1100, result: () => `${label} · ${doc.holder} · •••• ${doc.last4}` },
      { tool: "check_validity", label: p ? "Checking it against your trip dates" : "Checking the expiry date", ms: 800, result: () => (status === "ok" ? `Valid until ${fmtDate(doc.expires)}` : `Expires ${fmtDate(doc.expires)}, too close to the trip`) },
      { tool: "save_document", label: "Saving to Travel documents", ms: 600, result: () => "Details kept on this device · file not stored" },
    ]);
    if (!alive.current) return;
    docsStore.set(upsertDoc(docsStore.get(), doc));
    const next = p ? blockers(p, docsStore.get()) : [];
    const head = `Got it. ${label} for ${doc.holder}, ending ${doc.last4}, valid until ${fmtDate(doc.expires)}.`;
    const tail =
      status !== "ok"
        ? " Heads up: it expires within 6 months of your return, and some countries refuse entry on that. Worth renewing before you fly."
        : next.length
          ? ` Next I need your ${docMeta[next[0].req.kind].label.toLowerCase()}.`
          : p
            ? " That’s everything the bookings need. You’re ready to pay."
            : " Saved for your next trip.";
    await say(head + tail, 300);
    setSuggestions(p ? withDocSuggestions(p, suggestionsFor(buildPlan(p), "docs")) : ["Show my documents"]);
    setBusy(false);
  }

  const picker = useDocPicker((file, kind, travelerIndex) => void uploadDoc(file, kind, travelerIndex));

  async function handleDocIntent(text: string, intent: DocIntent) {
    setBusy(true);
    setSuggestions([]);
    push({ id: nid(), role: "user", text });
    const current = docsStore.get();
    const p = planned ? prefsRef.current : null;
    const base = p ? suggestionsFor(buildPlan(p), "docs") : [];
    let extra: string[] = [];
    if (intent.type === "privacy") {
      await say(
        "Your documents stay private. In this demo only the details (name, last four digits, expiry) are kept, in this browser, and the file itself is discarded after reading. In the full product each document goes only to the airline or hotel that needs it, after you approve payment, and it’s never used to train AI. Say “remove my passport” any time, or manage everything in Account → Travel documents.",
      );
      extra = ["Show my documents"];
    } else if (intent.type === "show") {
      await say(
        current.length
          ? `You have ${current.length} on file: ${joinList(current.map((d) => `${docMeta[d.kind].short.toLowerCase()} ending ${d.last4}`))}.`
          : "You haven’t saved any documents yet. Upload one below, or drop a file into the message box.",
      );
      push({ id: nid(), role: "agent", kind: "docs" });
    } else if (intent.type === "add") {
      await say(`Sure. Tap Upload next to your ${intent.kind ? docMeta[intent.kind].label.toLowerCase() : "document"}, or drop the file into the message box. I’ll read it and replace the old one.`);
      push({ id: nid(), role: "agent", kind: "docs" });
    } else if (!intent.kind) {
      await say("Which one should I remove? Say “remove my passport”, for example. Here’s what’s on file:");
      push({ id: nid(), role: "agent", kind: "docs" });
    } else {
      // Chat can't tell which traveler "my passport" means with more than one on file; removes traveler 1's.
      // Account → Travel documents removes a specific traveler's copy directly.
      const doc = findDoc(current, intent.kind);
      const label = docMeta[intent.kind].label.toLowerCase();
      if (!doc) {
        await say(`There’s no ${label} on file, so there’s nothing to remove.`);
      } else {
        docUndo.current = doc;
        docsStore.set(current.filter((d) => d.id !== doc.id));
        await say(`Removed your ${label} ending ${doc.last4} from this device.`);
        extra = ["Undo that"];
      }
    }
    setSuggestions([...extra, ...base].slice(0, 4));
    setBusy(false);
  }

  async function restoreDoc(text: string) {
    const doc = docUndo.current;
    docUndo.current = null;
    if (!doc) return;
    setBusy(true);
    setSuggestions([]);
    push({ id: nid(), role: "user", text });
    docsStore.set(upsertDoc(docsStore.get(), doc));
    await say(`Restored your ${docMeta[doc.kind].label.toLowerCase()} ending ${doc.last4}.`);
    setBusy(false);
  }

  async function skipQuestions() {
    const p = prefsRef.current;
    if (!p || busy) return;
    setBlocks((prev) => prev.map((b) => (b.role === "agent" && b.kind === "question" ? { ...b, done: true } : b)));
    push({ id: nid(), role: "user", text: "Skip the questions, just plan it" });
    await makePlan(p);
  }

  async function refine(text: string) {
    const p = prefsRef.current;
    if (!p || busy) return;
    const d = getDestination(p.destId);
    const t = text.toLowerCase();
    setBusy(true);
    setSuggestions([]);
    push({ id: nid(), role: "user", text });

    const current = livePlanStore.get();
    if (current && current.prefs.destId === p.destId && (await refineLive(text, t, current, d))) {
      setBusy(false);
      return;
    }

    if (t.includes("undo") && prevPrefs) {
      updatePrefs(prevPrefs);
      setPrevPrefs(null);
      const undonePlan = buildPlan(prevPrefs);
      persistTrip(prevPrefs, undonePlan, false, Math.round(undonePlan.totals.total * 100));
      await say(`Done, back to the previous version. Total is ${usd.format(undonePlan.totals.total)} again.`);
      setSuggestions(suggestionsFor(undonePlan, "undo"));
      setBusy(false);
      return;
    }

    let next: TripPrefs = p;
    let last = "other";
    if (t.includes("hotel") && t.includes("cheap")) {
      const idx = d.hotels.reduce((best, h, i) => (h.nightly < d.hotels[best].nightly ? i : best), 0);
      next = { ...p, hotelIdx: idx };
      last = "hotel-cheaper";
      await runWork("Re-checking stays", [
        { tool: "search_hotels", label: `Looking for cheaper stays in ${d.name}`, ms: 1100, preview: "hotels", result: () => `Found ${d.hotels[idx].name} at ${usd.format(d.hotels[idx].nightly)}/night` },
        { tool: "check_budget", label: "Re-running the totals", ms: 700, result: () => `${usd.format(buildPlan(next).totals.total)} total` },
      ]);
      const saved = buildPlan(p).totals.total - buildPlan(next).totals.total;
      setPrevPrefs(p);
      updatePrefs(next);
      await say(`Swapped to ${d.hotels[idx].name} in ${d.hotels[idx].area}. It saves ${usd.format(saved)} and still rates ${d.hotels[idx].rating}.`);
      push({ id: nid(), role: "agent", kind: "hotels" });
    } else if (t.includes("flight") && (t.includes("cheap") || t.includes("fast"))) {
      const tag = t.includes("cheap") ? "Cheapest" : "Fastest";
      const idx = Math.max(0, d.flights.findIndex((f) => f.tag === tag));
      next = { ...p, flightIdx: idx };
      last = tag === "Cheapest" ? "flight-cheaper" : "flight-faster";
      await runWork("Re-checking flights", [
        { tool: "search_flights", label: `Searching ${tag.toLowerCase()} options to ${d.airport}`, ms: 1200, preview: "flights", result: () => `${d.flights[idx].airline} ${d.flights[idx].code} · ${d.flights[idx].duration}` },
        { tool: "check_budget", label: "Re-running the totals", ms: 700, result: () => `${usd.format(buildPlan(next).totals.total)} total` },
      ]);
      setPrevPrefs(p);
      updatePrefs(next);
      await say(`Switched to ${d.flights[idx].airline} ${d.flights[idx].code}, ${d.flights[idx].duration}, ${d.flights[idx].stops.toLowerCase()}. New total ${usd.format(buildPlan(next).totals.total)}.`);
      push({ id: nid(), role: "agent", kind: "flights" });
    } else if (t.includes("eat") || t.includes("food") || t.includes("restaurant")) {
      last = "food";
      await runWork("Finding food", [{ tool: "search_food", label: `Asking around ${d.name}`, ms: 1100, result: () => `${d.food.length} places that locals actually go to` }]);
      await say(`Three places I’d book or queue for in ${d.name}:`, 300);
      push({ id: nid(), role: "agent", kind: "food" });
    } else if (t.includes("rest")) {
      next = { ...p, restDays: Math.min(p.restDays + 1, Math.max(0, p.nights - 2)) };
      last = "rest";
      await runWork("Adjusting the days", [{ tool: "build_itinerary", label: "Freeing up a day", ms: 1000, result: () => "One day with no bookings" }]);
      setPrevPrefs(p);
      updatePrefs(next);
      await say("Done. One day now has nothing booked, just a nice dinner. Here’s the new rhythm:");
      push({ id: nid(), role: "agent", kind: "days" });
    } else if (t.includes("stays") || t.includes("hotel")) {
      last = "hotels";
      await say(`All three stays I shortlisted in ${d.name}. Tap one to switch.`);
      push({ id: nid(), role: "agent", kind: "hotels" });
    } else if (t.includes("day") || t.includes("itinerary")) {
      last = "days";
      await say("Here’s the day-by-day as it stands:");
      push({ id: nid(), role: "agent", kind: "days" });
    } else {
      const other = findDestination(t);
      if (other && other.id !== d.id) {
        setBusy(false);
        setPlanned(false);
        setBlocks([]);
        await start(text);
        return;
      }
      await runWork("Thinking it through", [{ tool: "build_itinerary", label: "Checking the plan against your note", ms: 1100, result: () => "No conflicts found" }]);
      await say("Noted. I’ve kept the plan as is because it already fits. In the full version I’ll re-search with that in mind.");
    }
    if (next !== p) {
      const nextPlan = buildPlan(next);
      persistTrip(next, nextPlan, false, Math.round(nextPlan.totals.total * 100));
    }
    setSuggestions(suggestionsFor(buildPlan(prefsRef.current ?? next), last));
    setBusy(false);
  }

  /** Re-runs the real agent with one more constraint. Returns false for intents it leaves to the catalog. */
  async function refineLive(text: string, t: string, current: LivePlan, d: Destination): Promise<boolean> {
    if (/\bundo\b/.test(t)) {
      const prev = prevLive.current;
      if (!prev) return false;
      livePlanStore.set(prev);
      prevLive.current = null;
      const prefsAfterUndo = syncHotel(prev.prefs, prev);
      persistTrip(prefsAfterUndo, prev, true, Math.round(liveView(prev).total * 100), prev.source);
      await say(`Done, back to the previous plan. Total is ${usd.format(liveView(prev).total)} again.`);
      setSuggestions(liveSuggestions("undo", d.name));
      return true;
    }
    let constraint = text;
    let last = "other";
    let title = "Re-planning with your note";
    let show: "hotels" | "flights" | "days" | "plan" = "plan";
    if (t.includes("hotel") && t.includes("cheap")) {
      constraint = "Choose the cheapest hotel offer available.";
      [last, title, show] = ["hotel-cheaper", "Re-checking stays", "hotels"];
    } else if (t.includes("flight") && t.includes("cheap")) {
      constraint = "Choose the cheapest outbound and return flights.";
      [last, title, show] = ["flight-cheaper", "Re-checking flights", "flights"];
    } else if (t.includes("flight") && t.includes("fast")) {
      constraint = "Choose the shortest flights, even if they cost more.";
      [last, title, show] = ["flight-faster", "Re-checking flights", "flights"];
    } else if (t.includes("rest")) {
      constraint = "Leave at least one full day in the middle of the trip with no activities.";
      [last, title, show] = ["rest", "Adjusting the days", "days"];
    } else if (t.startsWith("use the hotel")) {
      [last, title, show] = ["hotel-pick", "Switching the stay", "hotels"];
    } else if (/(eat|food|restaurant|stays|itinerary|day by day|document|passport)/.test(t)) {
      return false;
    } else {
      const other = findDestination(t);
      if (other && other.id !== d.id) return false;
    }
    const before = liveView(current);
    const brief: TripBriefWire = { ...current.brief, constraints: [...current.brief.constraints, constraint].slice(-20) };
    const result = await runLiveAgent(title, current.prefs, brief);
    if (!alive.current) return true;
    if (!result) {
      await say(`The live planner didn’t answer (${lastLiveError.current}). Your current plan is unchanged.`);
      setSuggestions(liveSuggestions("none", d.name));
      return true;
    }
    prevLive.current = current;
    const prefsAfter = syncHotel(current.prefs, result);
    const after = liveView(result);
    persistTrip(prefsAfter, result, true, Math.round(after.total * 100), result.source);
    const diff = after.total - before.total;
    const change = diff === 0 ? "no change in price" : diff < 0 ? `${usd.format(-diff)} less` : `${usd.format(diff)} more`;
    await say(`${result.note} New total ${usd.format(after.total)} (${change}).`);
    push({ id: nid(), role: "agent", kind: show });
    setSuggestions(liveSuggestions(last, d.name));
    return true;
  }

  async function pickOption(kind: "flight" | "hotel", idx: number) {
    const p = prefsRef.current;
    if (!p || busy) return;
    const d = getDestination(p.destId);
    if (kind === "hotel" && livePlanStore.get()?.prefs.destId === p.destId) {
      if (p.hotelIdx === idx) return;
      return void refine(`Use the hotel “${d.hotels[idx].name}” for the whole stay`);
    }
    if ((kind === "flight" ? p.flightIdx : p.hotelIdx) === idx) return;
    const next = kind === "flight" ? { ...p, flightIdx: idx } : { ...p, hotelIdx: idx };
    setPrevPrefs(p);
    updatePrefs(next);
    setBusy(true);
    setSuggestions([]);
    const name = kind === "flight" ? `${d.flights[idx].airline} ${d.flights[idx].code}` : d.hotels[idx].name;
    const nextPlan = buildPlan(next);
    persistTrip(next, nextPlan, false, Math.round(nextPlan.totals.total * 100));
    await say(`Switched to ${name}. New total ${usd.format(nextPlan.totals.total)}.`, 350);
    setSuggestions(suggestionsFor(nextPlan, kind === "flight" ? "flight-faster" : "hotel-cheaper"));
    setBusy(false);
  }

  /**
   * "Make the hotel cheaper" typed in the chat: the same instant swap the
   * option buttons make (no new search, no agent run), answered in one line.
   */
  async function swapLive(fromOfferId: string, toOfferId: string) {
    const current = livePlanStore.get();
    if (!current?.quoteId) return;
    const before = liveView(current).total;
    const problem = swapChoice(fromOfferId, toOfferId);
    if (problem) return void say(problem, 150);
    prevLive.current = current;
    const next = livePlanStore.get();
    const after = next ? liveView(next).total : before;
    if (next) persistTrip(next.prefs, next, true, Math.round(after * 100), next.source);
    const to = next?.plan.offers.find((offer) => offer.id === toOfferId);
    await say(`Switched to ${to?.title ?? "the cheaper option"}: ${usd.format(before - after)} less, ${usd.format(after)} in total. Say “undo that” to switch back.`, 150);
  }

  /** "Make the hotel cheaper" / "Find a cheaper flight": the cheapest cheaper option, swapped in instantly. */
  function cheaperSwap(kind: "flight" | "hotel"): { from: string; to: string } | null {
    const slots = livePlanStore.get()?.alternatives?.filter((slot) => slot.kind === kind) ?? [];
    let best: { from: string; to: string; saving: number } | null = null;
    for (const slot of slots) {
      const current = slot.options.find((option) => option.offerId === slot.currentOfferId);
      const cheapest = slot.options[0];
      if (!current || !cheapest || cheapest.offerId === current.offerId) continue;
      const saving = current.costMinorUnits - cheapest.costMinorUnits;
      if (saving > 0 && (!best || saving > best.saving)) best = { from: current.offerId, to: cheapest.offerId, saving };
    }
    return best;
  }

  function route(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    const wantsCheaper = /cheaper|lebih murah|murah/i.test(value) ? (/hotel|stay|penginapan/i.test(value) ? "hotel" : /flight|fare|tiket|pesawat/i.test(value) ? "flight" : null) : null;
    if (wantsCheaper && livePlanStore.get()?.alternatives) {
      push({ id: nid(), role: "user", text: value });
      const swap = cheaperSwap(wantsCheaper);
      if (swap) return void swapLive(swap.from, swap.to);
      return void say(`This is already the cheapest ${wantsCheaper} across every platform I searched.`, 150);
    }
    const q = qIndex !== null ? questions[qIndex] : null;
    if (/\bundo\b/i.test(value) && docUndo.current) return void restoreDoc(value);
    docUndo.current = null;
    const intent = q ? null : docIntent(value);
    if (intent) return void handleDocIntent(value, intent);
    if (!prefsRef.current || blocks.length === 0) return void start(value);
    if (q) return void answer(q.id, value);
    if (planned) return void refine(value);
    return void start(value);
  }

  function submit(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    route(text);
  }

  /** Shared tail of resuming a trip once it's loaded: chat transcript, prefs and plan all swapped in, so one trip's data never bleeds into another's. */
  async function applyResumedTrip(tripId: string, trip: NonNullable<Awaited<ReturnType<typeof loadTrip>>>) {
    const history = await loadChatHistory(tripId);
    if (!alive.current) return;
    setBlocks(
      history.map((m) =>
        m.role === "user" ? { id: nid(), role: "user", text: m.text } : { id: nid(), role: "agent", kind: "text", text: m.text, streaming: false },
      ),
    );
    updatePrefs(trip.prefs);
    tripIdRef.current = tripId;
    setPrevPrefs(null);
    setQIndex(null);
    setStage(5);
    setPlanned(true);
    livePlanStore.set(trip.isLive ? (trip.plan as LivePlan) : null);
    const d = getDestination(trip.destId);
    push({ id: nid(), role: "agent", kind: "flights" });
    push({ id: nid(), role: "agent", kind: "hotels" });
    push({ id: nid(), role: "agent", kind: "plan" });
    setSuggestions(withDocSuggestions(trip.prefs, trip.isLive ? liveSuggestions("plan", d.name) : suggestionsFor(buildPlan(trip.prefs), "plan")));
    setBusy(false);
  }

  /**
   * A clicked trip id can be a client-fabricated placeholder (written to "Recent plans"
   * the instant a plan is made, before the server has confirmed its real id) or a stale
   * local cache entry that never got reconciled. Refresh from the server and retry once
   * by destId before giving up, so the right history loads on the first click instead of
   * silently falling through to a blank "new chat".
   */
  async function resolveTrip(tripId: string, destId: string | null) {
    const direct = await loadTrip(tripId);
    if (direct || !destId || !alive.current) return { tripId, trip: direct };
    await hydrateFromServer();
    if (!alive.current) return { tripId, trip: null };
    const fresh = historyStore.get().find((h) => h.destId === destId);
    if (!fresh) return { tripId, trip: null };
    return { tripId: fresh.id, trip: await loadTrip(fresh.id) };
  }

  /** Resumes a trip from "Recent plans": restores its stored chat transcript and plan, so the traveller can keep chatting about it. */
  async function openRecent(tripId: string, destId: string) {
    if (busy) return;
    setBusy(true);
    setResuming(true);
    const { tripId: resolvedId, trip } = await resolveTrip(tripId, destId);
    if (!alive.current) return;
    setResuming(false);
    if (!trip) {
      // Still nothing after a retry — the trip's genuinely gone. A fresh start beats a blank screen.
      setBusy(false);
      void start(getDestination(destId).name);
      return;
    }
    await applyResumedTrip(resolvedId, trip);
  }

  /** Resumes a trip linked to from elsewhere (the Account page's Trips tab) via `/plan?resume=<id>&dest=<destId>`. */
  async function openByUrl(tripId: string, destId: string | null) {
    if (busy) return;
    setBusy(true);
    setResuming(true);
    const { tripId: resolvedId, trip } = await resolveTrip(tripId, destId);
    if (!alive.current) return;
    setResuming(false);
    if (!trip) {
      // No destination to fall back to when the link carries none, unlike openRecent, so a blank planner beats a guess.
      setBusy(false);
      return;
    }
    await applyResumedTrip(resolvedId, trip);
  }

  function reset() {
    if (busy) return;
    setBlocks([]);
    updatePrefs(null);
    setPlanned(false);
    setQIndex(null);
    setStage(0);
    setSuggestions([]);
  }

  // The demo has one account: a signed-out visitor sees the sign-in page first, then comes back here.
  useEffect(() => {
    if (!hydrated || user) return;
    const resumeId = params.get("resume");
    const q = params.get("q");
    const next = resumeId ? `/plan?resume=${encodeURIComponent(resumeId)}` : q ? `/plan?q=${encodeURIComponent(q)}` : "/plan";
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [hydrated, user, params, router]);

  useEffect(() => {
    if (!ready) return;
    const resumeId = params.get("resume");
    if (resumeId && !started.current) {
      started.current = true;
      void openByUrl(resumeId, params.get("dest"));
      return;
    }
    const q = params.get("q");
    if (q && !started.current) {
      started.current = true;
      void start(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, ready]);

  const activeQuestion = qIndex !== null ? questions[qIndex] : null;
  const placeholder = activeQuestion ? activeQuestion.placeholder : busy ? "The planner is working…" : planned ? "Ask for a change: cheaper, slower, more food…" : "Name a place…";
  const destSaved = dest ? saved.includes(dest.id) : false;

  // Hold a skeleton until we know who is here, so a signed-out visitor never sees the planner flash before sign-in.
  if (!ready) return <PlannerSkeleton ref={root} />;

  return (
    <div ref={root} className={`pl ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="pl-side" aria-label="Workspace">
        <AppSidebar onNewTrip={reset} onRecent={openRecent} busy={busy} />
      </aside>

      <main className="pl-main">
        <header className="pl-mobilebar">
          <MobileNav onNewTrip={reset} onRecent={openRecent} busy={busy} />
          <span>{dest ? dest.name : "New trip"}</span>
          <div className="pl-mobilebar-actions">
            <button ref={planChip} type="button" className="chip" onClick={() => setPanelOpen(true)} disabled={!dest} aria-expanded={panelOpen}>
              <Icon name="map" /> Plan
            </button>
            <AccountMenu />
          </div>
        </header>
        <p className="sr-only" role="status">
          {announce}
        </p>

        <div className="pl-thread" ref={threadRef} data-lenis-prevent>
          {resuming ? (
            <ChatSkeleton />
          ) : blocks.length === 0 ? (
            <div className="pl-welcome">
              <p className="pl-hi">Hi {firstName}</p>
              <h1>Where do you want to go?</h1>
              <p className="pl-welcome-sub">Describe the trip in your own words: cities, days, what you want to see. Or pick a place below. I’ll search every partner platform for the best deal.</p>
              <form
                className="pl-welcome-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(input);
                }}
              >
                <Icon name="search" size={18} />
                <label htmlFor="pl-where" className="sr-only">
                  Destination
                </label>
                <input id="pl-where" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Japan: Tokyo day 1, Osaka day 2, Mount Fuji day 3…" autoComplete="off" />
                <button type="submit" className="btn btn-ember btn-sm" disabled={!input.trim()}>
                  Start
                  <span className="btn-arrow">
                    <Icon name="arrow" />
                  </span>
                </button>
              </form>
              <div className="pl-places">
                {destinations.map((d) => (
                  <button key={d.id} type="button" className="pl-place" onClick={() => start(d.name)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.card} alt="" />
                    <span>
                      <b>{d.name}</b>
                      <small>{d.country}</small>
                    </span>
                  </button>
                ))}
                <button type="button" className="pl-place pl-surprise" onClick={() => start("Surprise me")}>
                  <Icon name="spark" size={22} />
                  <span>
                    <b>Surprise me</b>
                    <small>Pick one for me</small>
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <ol className="pl-messages">
              {blocks.map((b, i) => {
                const prev = blocks[i - 1];
                const showMark = b.role === "agent" && (!prev || prev.role !== "agent");
                if (b.role === "user") {
                  return (
                    <li key={b.id} className="pl-msg pl-msg-user">
                      {b.file ? (
                        <span className="pl-attach">
                          <span className="pl-attach-icon">
                            <Icon name="file" size={17} />
                          </span>
                          <span>
                            <b>{b.file.name}</b>
                            <small>{fmtSize(b.file.size)} · private upload</small>
                          </span>
                        </span>
                      ) : (
                        <p>{b.text}</p>
                      )}
                    </li>
                  );
                }
                return (
                  <li key={b.id} className={`pl-msg pl-msg-agent ${showMark ? "has-mark" : ""}`}>
                    <span className="pl-agent-mark" aria-hidden={!showMark}>
                      {showMark && <LogoMark />}
                    </span>
                    <div className="pl-agent-body">
                      <AgentBlock
                        block={b}
                        prefs={prefs}
                        docPrefs={planned ? prefs : null}
                        onPickDoc={(k, idx) => picker.open(k, idx)}
                        busy={busy}
                        onAnswer={answer}
                        onSkip={skipQuestions}
                        onPick={pickOption}
                        alternatives={live?.alternatives}
                        onStart={start}
                        lv={lv}
                        paid={paid}
                      />
                    </div>
                  </li>
                );
              })}
              {!busy && suggestions.length > 0 && (
                <li className="pl-msg pl-msg-agent pl-suggest-row">
                  <span className="pl-agent-mark" aria-hidden="true" />
                  <div className="pl-suggest" role="group" aria-label="Suggested follow-ups">
                    {suggestions.map((s) => (
                      <button key={s} type="button" onClick={() => route(s)}>
                        <Icon name="spark" size={13} />
                        {s}
                      </button>
                    ))}
                  </div>
                </li>
              )}
            </ol>
          )}
        </div>

        {planned && lv && (
          <div className="pl-actionbar" role="region" aria-label="Your plan">
            <span className="pl-actionbar-total">
              <b>{usd.format(lv.total)}</b>
              <small>{lv.title}</small>
              <EditStatus />
            </span>
            <Link href="/trip" className="btn btn-sm">
              View itinerary
            </Link>
            {paid ? (
              <Link href="/booked" className="btn btn-sm btn-ember">
                <Icon name="check" size={14} /> Paid
              </Link>
            ) : live?.syncing ? (
              <button type="button" className="btn btn-sm btn-ember" disabled>
                Saving…
              </button>
            ) : (
              <Link href="/checkout" className="btn btn-sm btn-ember">
                Pay once with PayPal
              </Link>
            )}
          </div>
        )}
        {blocks.length > 0 && (
          <form
            className="pl-composer"
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
          >
            {picker.input}
            <div
              className={`pl-input ${dragging ? "is-drag" : ""}`}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes("Files")) return;
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                const f = e.dataTransfer.files?.[0];
                setDragging(false);
                if (!f) return;
                e.preventDefault();
                void uploadDoc(f);
              }}
            >
              <button type="button" className="pl-attach-btn" onClick={() => picker.open()} disabled={busy} aria-label="Upload a travel document" title="Upload a travel document">
                <Icon name="paperclip" size={18} />
              </button>
              <label htmlFor="pl-q" className="sr-only">
                Message the planner
              </label>
              <textarea
                id="pl-q"
                rows={1}
                value={input}
                placeholder={placeholder}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(input);
                  }
                }}
              />
              <button type="submit" className="pl-send" aria-label="Send" disabled={busy || !input.trim()}>
                <Icon name="send" size={18} />
              </button>
            </div>
            <p className="pl-fine">
              Demo data. Prices are checked by code, not the model, and nothing is charged until you approve. The planner can make mistakes, so check entry rules
              with official sources. <Link href="/legal">Terms &amp; privacy</Link>
            </p>
          </form>
        )}
      </main>

      <aside
        className={`pl-panel ${panelOpen ? "is-open" : ""}`}
        aria-label="Trip details"
        data-lenis-prevent
        onKeyDown={(e) => {
          if (e.key === "Escape" && panelOpen) closePanel();
        }}
      >
        <button ref={panelClose} type="button" className="pl-panel-close" onClick={closePanel} aria-label="Close trip details">
          <Icon name="close" size={16} />
        </button>
        {!dest || !plan ? (
          <div className="pl-panel-empty">
            <div className="pl-empty-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/m-train.webp" alt="" />
            </div>
            <h2>Your plan builds here</h2>
            <p>As the agent searches, you’ll see the place, each booking and the budget fill in live.</p>
          </div>
        ) : (
          <div className="pl-panel-inner" key={dest.id}>
            <div className="pl-dest">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={dest.card} alt="" />
              <div>
                <h2>{dest.name}</h2>
                <span>
                  <Icon name="pin" size={14} /> {dest.country}
                </span>
              </div>
              <button
                type="button"
                className={`pl-dest-fav ${destSaved ? "is-on" : ""}`}
                aria-pressed={destSaved}
                aria-label={`Save ${dest.name}`}
                title={destSaved ? "Saved to your places" : "Save to your places"}
                onClick={() => savedStore.set(destSaved ? saved.filter((x) => x !== dest.id) : [...saved, dest.id])}
              >
                <Icon name="heart" size={16} />
              </button>
            </div>
            <dl className="pl-facts">
              <div>
                <dt>Weather</dt>
                <dd>{dest.weather}</dd>
              </div>
              <div>
                <dt>Time zone</dt>
                <dd>{dest.timezone}</dd>
              </div>
              <div>
                <dt>Currency</dt>
                <dd>{dest.currency}</dd>
              </div>
            </dl>
            <div className="pl-tabs" role="tablist" aria-label="Trip details">
              {(["overview", "todo", "map"] as const).map((t, _i, all) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  id={`pl-tab-${t}`}
                  data-tab={t}
                  aria-selected={panelTab === t}
                  aria-controls="pl-tabpanel"
                  tabIndex={panelTab === t ? 0 : -1}
                  className={panelTab === t ? "is-active" : ""}
                  onClick={() => setPanelTab(t)}
                  onKeyDown={(e) => tabKeys(e, all, panelTab, setPanelTab)}
                >
                  {t === "overview" ? "Overview" : t === "todo" ? "Things to do" : "Map"}
                </button>
              ))}
            </div>

            <div id="pl-tabpanel" role="tabpanel" aria-labelledby={`pl-tab-${panelTab}`}>
            {panelTab === "overview" && (
              <div className="pl-tab-body">
                <div className="pl-budget">
                  <div className="pl-budget-top">
                    <span className="pl-label">Budget</span>
                    <span>{stage >= 4 ? `${usd.format(plan.totals.total)} / ${usd.format(plan.prefs.budget)}` : stage > 0 || (busy && qIndex === null) ? "Calculating…" : "Waiting for answers"}</span>
                  </div>
                  <div className={`budget-bar ${plan.underBy < 0 && stage >= 4 ? "is-over" : ""}`}>
                    <i style={{ width: stage >= 4 ? `${Math.min(100, (plan.totals.total / plan.prefs.budget) * 100)}%` : `${stage * 16}%` }} />
                  </div>
                </div>
                <ul className="pl-items">
                  <li className={stage >= 1 ? "is-in" : ""}>
                    <Icon name="plane" size={16} />
                    <span>
                      <b>{stage >= 1 ? `${plan.originCode} ⇄ ${dest.airport}` : "Flights"}</b>
                      <small>{stage >= 1 ? `${plan.flight.airline} · ${plan.flight.stops}` : "Searching after your answers"}</small>
                    </span>
                    <em>{stage >= 1 ? usd.format(plan.totals.flights) : ""}</em>
                  </li>
                  <li className={stage >= 2 ? "is-in" : ""}>
                    <Icon name="bed" size={16} />
                    <span>
                      <b>{stage >= 2 ? plan.hotel.name : "Stay"}</b>
                      <small>{stage >= 2 ? `${plan.prefs.nights} nights · ${plan.hotel.area}` : "Shortlisting"}</small>
                    </span>
                    <em>{stage >= 2 ? usd.format(plan.totals.hotel) : ""}</em>
                  </li>
                  <li className={stage >= 3 ? "is-in" : ""}>
                    <Icon name="compass" size={16} />
                    <span>
                      <b>{stage >= 3 ? `${plan.activities.length} ${plan.activities.length === 1 ? "activity" : "activities"}` : "Things to do"}</b>
                      <small>{stage >= 3 ? plan.activities.map((a) => a.title.split(" ")[0]).join(" · ") : "Matching your vibe"}</small>
                    </span>
                    <em>{stage >= 3 ? usd.format(plan.totals.activities) : ""}</em>
                  </li>
                </ul>
                {planned &&
                  (() => {
                    const req = readiness(plan.prefs, docs).filter((r) => r.req.need === "required");
                    const ok = req.filter((r) => r.status === "ok").length;
                    const ready = ok === req.length;
                    return (
                      <Link href="/account?tab=documents" className={`pl-docs-mini ${ready ? "is-ready" : ""}`}>
                        <Icon name={ready ? "shield" : "passport"} size={18} />
                        <span>
                          <b>Travel documents</b>
                          <small>{ready ? "Ready for checkout" : `${ok} of ${req.length} required ready`}</small>
                        </span>
                        <Icon name="arrow" size={14} />
                      </Link>
                    );
                  })()}
                <div className="pl-advice">
                  <h3>Good to know</h3>
                  <p>
                    <Icon name="sun" size={16} /> {dest.bestTime}
                  </p>
                  {dest.tips.map((tip) => (
                    <p key={tip}>
                      <Icon name="leaf" size={16} /> {tip}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {panelTab === "todo" && lv && live?.activityOptions?.length ? (
              <div className="pl-tab-body">
                <ActivityOptions />
              </div>
            ) : panelTab === "todo" && (
              <div className="pl-tab-body pl-todo">
                {dest.activities.map((a) => (
                  <article key={a.id} className={plan.prefs.activityIds.includes(a.id) ? "is-picked" : ""}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.image} alt="" />
                    <b>{a.title}</b>
                    <span>
                      <Icon name="star" size={12} /> {a.rating} · {a.pricePerPerson ? `${usd.format(a.pricePerPerson)} pp` : "Free"}
                    </span>
                  </article>
                ))}
              </div>
            )}
            {panelTab === "map" && (
              <div className="pl-tab-body">
                <div className="pl-map">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/app-map.webp" alt="Illustrative map of the area, not to scale" />
                  {[plan.hotel.area, ...plan.activities.map((a) => a.title)].slice(0, 4).map((label, i) => (
                    <span key={label} style={{ left: `${24 + i * 15}%`, top: `${30 + ((i * 17) % 40)}%` }}>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
            </div>
            {planned && (
              <div className="pl-panel-cta">
                <Link href="/trip" className="btn btn-ghost btn-sm">
                  Itinerary
                </Link>
                {paid ? (
                  <Link href="/booked" className="btn btn-ember btn-sm">
                    <Icon name="check" size={14} /> Paid
                  </Link>
                ) : live?.syncing ? (
                  <button type="button" className="btn btn-ember btn-sm" disabled>
                    Saving…
                  </button>
                ) : (
                  <Link href="/checkout" className="btn btn-ember btn-sm">
                    Pay {usd.format(plan.totals.total)}
                    <span className="btn-arrow">
                      <Icon name="arrow" />
                    </span>
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function AgentBlock({
  block,
  prefs,
  docPrefs,
  onPickDoc,
  busy,
  onAnswer,
  onSkip,
  onPick,
  onStart,
  lv,
  alternatives,
  paid,
}: {
  lv: LiveView | null;
  alternatives?: AlternativeSlot[];
  paid: boolean;

  block: Exclude<Block, { role: "user" }>;
  prefs: TripPrefs | null;
  docPrefs: TripPrefs | null;
  onPickDoc: (k: DocKind, travelerIndex: number) => void;
  busy: boolean;
  onAnswer: (q: QuestionId, v: string) => void;
  onSkip: () => void;
  onPick: (k: "flight" | "hotel", i: number) => void;
  onStart: (t: string) => void;
}) {
  const [multi, setMulti] = useState<string[]>([]);
  const plan = prefs ? overlayLive(buildPlan(prefs), lv) : null;

  if (block.kind === "typing") {
    return (
      <span className="pl-typing" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    );
  }
  if (block.kind === "text") {
    return (
      <p className="pl-agent-text">
        {block.text}
        {block.streaming && <span className="pl-caret" />}
      </p>
    );
  }
  if (block.kind === "question") {
    return (
      <div className={`pl-question ${block.done ? "is-done" : ""}`}>
        <p className="pl-agent-text">{block.text}</p>
        <div className="pl-options">
          {block.options.map((o) => {
            const on = block.done ? block.picked.includes(o) : multi.includes(o);
            return (
              <button
                key={o}
                type="button"
                className={on ? "is-on" : ""}
                disabled={block.done || busy}
                onClick={() => {
                  if (block.multi) setMulti((m) => (m.includes(o) ? m.filter((x) => x !== o) : [...m, o]));
                  else onAnswer(block.qid, o);
                }}
              >
                {block.multi && <span className="pl-check">{on && <Icon name="check" size={11} />}</span>}
                {o}
              </button>
            );
          })}
        </div>
        {!block.done && (
          <div className="pl-question-foot">
            {block.multi && (
              <button type="button" className="btn btn-sm" disabled={!multi.length || busy} onClick={() => onAnswer(block.qid, multi.join(", "))}>
                Done, plan it
                <span className="btn-arrow">
                  <Icon name="arrow" />
                </span>
              </button>
            )}
            <button type="button" className="pl-skip" onClick={onSkip} disabled={busy}>
              Skip the questions, just plan it
            </button>
          </div>
        )}
      </div>
    );
  }
  if (block.kind === "places") {
    return (
      <div className="pl-options">
        {destinations.map((d) => (
          <button key={d.id} type="button" onClick={() => onStart(d.name)} disabled={busy}>
            {d.name}
          </button>
        ))}
      </div>
    );
  }
  if (block.kind === "work") {
    return <WorkCard block={block} />;
  }
  if (block.kind === "docs") {
    return <DocChecklist prefs={docPrefs} busy={busy} onPick={onPickDoc} />;
  }
  if (!plan) return null;
  const { dest } = plan;

  if (block.kind === "brief") {
    const p = plan.prefs;
    return (
      <div className="pl-brief">
        {[
          { icon: "pin" as IconName, label: `${p.origin} → ${dest.name}` },
          { icon: "calendar" as IconName, label: `${p.when} · ${p.nights} nights` },
          { icon: "users" as IconName, label: p.travelerLabel },
          { icon: "wallet" as IconName, label: p.budget >= 12000 ? "No hard limit" : `Up to ${usd.format(p.budget)}` },
          { icon: "spark" as IconName, label: p.vibes.join(", ") },
        ].map((x) => (
          <span key={x.label}>
            <Icon name={x.icon} size={14} /> {x.label}
          </span>
        ))}
      </div>
    );
  }
  if (block.kind === "flights" && lv && alternatives?.some((slot) => slot.kind === "flight")) {
    return <LiveOptions kind="flight" />;
  }
  if (block.kind === "hotels" && lv && alternatives?.some((slot) => slot.kind === "hotel")) {
    return <LiveOptions kind="hotel" />;
  }
  if (block.kind === "flights" && lv) {
    return (
      <div className="pl-options-card">
        <p className="pl-card-title">
          <Icon name="plane" size={15} /> Live fares · {lv.flights[0]?.from ?? plan.originCode} ⇄ {lv.flights[0]?.to ?? dest.airport} · {plan.prefs.travelers} {plan.prefs.travelers > 1 ? "travellers" : "traveller"}
        </p>
        <div className="pl-flights pl-flights-live">
          {lv.flights.map((f) => (
            <div key={f.id} className="pl-flight-live is-selected">
              <span className="pl-tag tag-best">{f.date}</span>
              <span className="pl-fl-route">
                <b>{f.depart}</b>
                <i>
                  <small>{f.duration}</small>
                </i>
                <b>{f.arrive}</b>
              </span>
              <span className="pl-fl-meta">
                {f.from} → {f.to} · {f.airline} · {f.stops}
              </span>
              <span className="pl-fl-price">{usd.format(f.price)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (block.kind === "flights") {
    return (
      <div className="pl-options-card">
        <p className="pl-card-title">
          <Icon name="plane" size={15} /> Flights · {plan.originCode} ⇄ {dest.airport} · {plan.prefs.travelers} {plan.prefs.travelers > 1 ? "travellers" : "traveller"}
        </p>
        <div className="pl-flights">
          {dest.flights.map((f, i) => (
            <button key={f.id} type="button" className={plan.prefs.flightIdx === i ? "is-selected" : ""} onClick={() => onPick("flight", i)} disabled={busy}>
              <span className={`pl-tag tag-${f.tag.toLowerCase()}`}>{f.tag}</span>
              <span className="pl-fl-route">
                <b>{f.depart}</b>
                <i>
                  <small>{f.duration}</small>
                </i>
                <b>{f.arrive.replace(/\+\d/, "")}</b>
              </span>
              <span className="pl-fl-meta">
                {f.airline} · {f.stops}
              </span>
              <span className="pl-fl-price">{usd.format(flightTotal(f, plan.prefs))}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (block.kind === "hotels") {
    return (
      <div className="pl-options-card">
        <p className="pl-card-title">
          <Icon name="bed" size={15} /> Stays · {plan.prefs.nights} nights
        </p>
        <div className="pl-hotels">
          {dest.hotels.map((h, i) => (
            <button key={h.id} type="button" className={plan.prefs.hotelIdx === i ? "is-selected" : ""} onClick={() => onPick("hotel", i)} disabled={busy}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={h.image} alt="" />
              <span className="pl-ho-body">
                <span className="pl-tag">{h.tag}</span>
                <b>{h.name}</b>
                <small>
                  {h.area} · <Icon name="star" size={11} /> {h.rating}
                </small>
                <span className="pl-ho-price">
                  {usd.format(h.nightly)}
                  <small>/night</small>
                </span>
              </span>
              {plan.prefs.hotelIdx === i && (
                <span className="pl-selected-mark">
                  <Icon name="check" size={12} />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (block.kind === "food") {
    return (
      <div className="pl-food">
        {dest.food.map((f) => (
          <article key={f.name}>
            {f.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.image} alt="" />
            ) : (
              <span className="pl-food-icon">
                <Icon name="leaf" size={18} />
              </span>
            )}
            <span>
              <b>{f.name}</b>
              <small>
                {f.dish} · {f.area} · {f.price}
              </small>
              <em>{f.note}</em>
            </span>
          </article>
        ))}
      </div>
    );
  }
  if (block.kind === "days" && lv) {
    return (
      <>
        <ol className="pl-days">
          {plan.days.map((d) => (
            <li key={d.day}>
              <span className="pl-day-num">Day {d.day}</span>
              <b>{d.title}</b>
              <small>{d.items.map((x) => x.title).join(" · ")}</small>
            </li>
          ))}
        </ol>
        <ActivityOptions />
      </>
    );
  }
  if (block.kind === "days") {
    return (
      <ol className="pl-days">
        {plan.days.map((d) => (
          <li key={d.day}>
            <span className="pl-day-num">Day {d.day}</span>
            <b>{d.title}</b>
            <small>{d.items.map((x) => x.title).join(" · ")}</small>
          </li>
        ))}
      </ol>
    );
  }
  if (block.kind === "plan") {
    return (
      <article className="pl-plan">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dest.hero} alt="" />
        <div className="pl-plan-body">
          <p className="pl-plan-status">
            <i /> Itinerary ready
          </p>
          <h3>
            {plan.prefs.nights} nights in {dest.name}
          </h3>
          <p className="pl-plan-meta">
            {plan.prefs.when} · {plan.prefs.travelerLabel} · {plan.activities.length} {plan.activities.length === 1 ? "activity" : "activities"}
          </p>
          <div className="pl-plan-total">
            <b>{usd.format(plan.totals.total)}</b>
            <span>of {plan.prefs.budget >= 12000 ? "no fixed" : usd.format(plan.prefs.budget)} budget</span>
          </div>
          <div className={`budget-bar ${plan.underBy < 0 ? "is-over" : ""}`}>
            <i style={{ width: `${Math.min(100, (plan.totals.total / plan.prefs.budget) * 100)}%` }} />
          </div>
          {lv?.deal && <DealLine deal={lv.deal} />}
          <div className="pl-plan-actions">
            <Link href="/trip" className="btn btn-sm">
              Open itinerary
              <span className="btn-arrow">
                <Icon name="arrow" />
              </span>
            </Link>
            {paid ? (
              <Link href="/booked" className="btn btn-sm btn-ghost">
                <Icon name="check" size={14} /> Paid
              </Link>
            ) : (
              <Link href="/checkout" className="btn btn-sm btn-ghost">
                Pay once
              </Link>
            )}
          </div>
        </div>
      </article>
    );
  }
  return null;
}

function WorkCard({ block }: { block: Extract<Block, { kind: "work" }> }) {
  const ref = useRef<HTMLDivElement>(null);
  const doneCount = block.steps.filter((s) => s.status === "done").length;
  const pct = (doneCount / block.steps.length) * 100;
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (block.done) {
      const t = setTimeout(() => setOpen(false), 900);
      return () => clearTimeout(t);
    }
  }, [block.done]);

  return (
    <div ref={ref} className={`pl-work ${block.done ? "is-done" : ""} ${open ? "is-open" : ""}`}>
      <button type="button" className="pl-work-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="pl-weave-loader" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M3 8c4-3 6 3 9 0s5-3 9 0M3 16c4-3 6 3 9 0s5-3 9 0" />
          </svg>
        </span>
        <span className="pl-work-title">
          {block.done ? "Done" : block.title}
          <small>
            {doneCount}/{block.steps.length} steps
          </small>
        </span>
        <Icon name="chevron" size={16} className="pl-work-chev" />
      </button>
      <span className="pl-work-progress" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </span>
      <div className="pl-work-body">
        <ul>
          {block.steps.map((s) => (
            <li key={s.id} className={`is-${s.status}`}>
              <span className="pl-step-icon">
                {s.status === "done" ? <Icon name="check" size={12} /> : <Icon name={toolIcon[s.tool] ?? "spark"} size={13} />}
              </span>
              <span className="pl-step-text">
                <b>{s.label}</b>
                <small>{s.status === "done" ? s.result : s.status === "running" ? <code>{s.tool}()</code> : "Queued"}</small>
              </span>
              {s.status === "running" && <span className="pl-shimmer" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
