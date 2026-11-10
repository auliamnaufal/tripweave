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
  type Destination,
  type TripPrefs,
} from "@/features/ui-mock/destinations";
import { acknowledgements, applyAnswer, planSummary, questions, suggestionsFor, type QuestionId } from "@/features/ui-mock/agentScript";
import { docsStore, historyStore, savedStore, tripStore, useDocs, useHistory, useHydrated, useSaved, useUser } from "@/features/ui-mock/tripStore";
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
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { briefFromPrefs, streamPlan, type TripBriefWire } from "@/features/live/client";
import { livePaymentStore, livePlanStore, useLivePlan, type LivePlan } from "@/features/live/liveStore";
import { liveView, overlayLive, type LiveView } from "@/features/live/adapter";
import { logChatMessage, syncTrip } from "@/features/db/sync";

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

const nav: { icon: IconName; label: string; href: string; active?: boolean }[] = [
  { icon: "chat", label: "Planner", href: "/plan", active: true },
  { icon: "ticket", label: "My trips", href: "/account?tab=trips" },
  { icon: "heart", label: "Saved places", href: "/account?tab=saved" },
  { icon: "passport", label: "Travel documents", href: "/account?tab=documents" },
  { icon: "globe", label: "Explore", href: "/#journeys" },
  { icon: "user", label: "Account", href: "/account" },
];

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
  const history = useHistory();
  const firstName = user?.firstName ?? "there";

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [prefs, setPrefs] = useState<TripPrefs | null>(null);
  const [prevPrefs, setPrevPrefs] = useState<TripPrefs | null>(null);
  const [qIndex, setQIndex] = useState<number | null>(null);
  const [planned, setPlanned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [panelTab, setPanelTab] = useState<"overview" | "todo" | "map">("overview");
  const [panelOpen, setPanelOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
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
  // The DB row for the trip currently being planned, once syncTrip() has returned one — chat
  // messages logged before that point are saved with no trip_id (still the user's, just unlinked).
  const tripIdRef = useRef<string | null>(null);

  const live = useLivePlan();
  const prevLive = useRef<LivePlan | null>(null);
  const lastLiveError = useRef("");
  const dest = prefs ? getDestination(prefs.destId) : null;
  const lv = useMemo(() => (live && prefs && live.prefs.destId === prefs.destId ? liveView(live) : null), [live, prefs]);
  const plan = useMemo(() => (prefs ? overlayLive(buildPlan(prefs), lv) : null), [prefs, lv]);

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
      gsap.from(".pl-side > *", { x: -16, opacity: 0, stagger: 0.04, duration: 0.8, ease: "expo.out" });
      gsap.from(".pl-welcome > *", { y: 28, opacity: 0, stagger: 0.07, duration: 1.1, ease: "expo.out", delay: 0.1 });
      gsap.from(".pl-place", { y: 30, opacity: 0, stagger: 0.05, duration: 1, ease: "expo.out", delay: 0.35 });
    },
    { scope: root, dependencies: [ready] },
  );

  const push = useCallback((b: Block) => {
    if (b.role === "user" && b.text) logChatMessage({ role: "user", text: b.text, tripId: tripIdRef.current });
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
    logChatMessage({ role: "agent", kind: "text", text, tripId: tripIdRef.current });
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
  async function runLiveAgent(title: string, p: TripPrefs, brief: TripBriefWire): Promise<LivePlan | null> {
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
          out.plan = { prefs: p, brief, plan: event.plan, note: event.note, source: event.source, retrievedAt: event.retrievedAt };
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
    push({ id: nid(), role: "user", text: value });
    const d = value.toLowerCase().includes("surprise") ? pickRandom(destinations) : findDestination(value);
    if (!d) {
      await say("I don’t have demo data for that place yet. These are the places I can plan end to end right now:");
      push({ id: nid(), role: "agent", kind: "places" });
      setBusy(false);
      return;
    }
    const p = defaultPrefs(d.id);
    updatePrefs(p);
    setStage(0);
    await say(`${d.name}, good choice. ${d.blurb} A few quick questions so I search for the right things.`);
    await askQuestion(0, d, p);
    setBusy(false);
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

  async function makePlan(input: TripPrefs) {
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
    const liveResult = await runLiveAgent(`Planning ${d.name}`, p, briefFromPrefs(p));
    if (!alive.current) return;
    if (liveResult) {
      p = syncHotel(p, liveResult);
      setPlanned(true);
      tripStore.set(p);
      const hl = historyStore.get();
      const stl = stamp();
      historyStore.set([{ id: `${p.destId}-${stl.id}`, title: `${d.name}, ${p.nights} nights`, destId: d.id, at: stl.at }, ...hl.filter((x) => x.destId !== d.id)].slice(0, 6));
      syncTrip({
        destId: p.destId,
        title: `${d.name}, ${p.nights} nights`,
        prefs: p,
        plan: liveResult,
        isLive: true,
        source: liveResult.source,
        totalMinorUnits: Math.round(liveView(liveResult).total * 100),
        budgetMinorUnits: Math.round(p.budget * 100),
      }).then((id) => (tripIdRef.current = id));
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
    syncTrip({
      destId: p.destId,
      title: `${d.name}, ${p.nights} nights`,
      prefs: p,
      plan: pl,
      isLive: false,
      totalMinorUnits: Math.round(pl.totals.total * 100),
      budgetMinorUnits: Math.round(p.budget * 100),
    }).then((id) => (tripIdRef.current = id));
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

  async function uploadDoc(file: File, expected?: DocKind) {
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
    const firstOpen = p ? (blockers(p, current)[0] ?? readiness(p, current).find((r) => r.status !== "ok"))?.req.kind : undefined;
    const kind = expected ?? guessKind(file.name, firstOpen ?? "passport");
    const doc = readDocument({ kind, fileName: file.name, fileSize: file.size, holder: user?.name ?? "Traveller", prefs: p, source: "chat" });
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

  const picker = useDocPicker((file, kind) => void uploadDoc(file, kind));

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
      await say(`Done, back to the previous version. Total is ${usd.format(buildPlan(prevPrefs).totals.total)} again.`);
      setSuggestions(suggestionsFor(buildPlan(prevPrefs), "undo"));
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
      syncHotel(prev.prefs, prev);
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
    syncHotel(current.prefs, result);
    const after = liveView(result);
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
    await say(`Switched to ${name}. New total ${usd.format(buildPlan(next).totals.total)}.`, 350);
    setSuggestions(suggestionsFor(buildPlan(next), kind === "flight" ? "flight-faster" : "hotel-cheaper"));
    setBusy(false);
  }

  function route(text: string) {
    const value = text.trim();
    if (!value || busy) return;
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
    const q = params.get("q");
    router.replace(`/login?next=${encodeURIComponent(q ? `/plan?q=${encodeURIComponent(q)}` : "/plan")}`);
  }, [hydrated, user, params, router]);

  useEffect(() => {
    if (!ready) return;
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

  // Hold an empty shell until we know who is here, so a signed-out visitor never sees the planner flash before sign-in.
  if (!ready) return <div ref={root} className="pl" aria-busy="true" />;

  return (
    <div ref={root} className={`pl ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="pl-side" aria-label="Workspace">
        <div className="pl-side-top">
          <Link href="/" className="logo pl-logo" aria-label="Tripweave home">
            <LogoMark />
            <span>Tripweave</span>
          </Link>
          <button type="button" className="pl-collapse" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <Icon name="chevron" size={16} />
          </button>
        </div>
        <button type="button" className="pl-new" onClick={reset} data-tip="New trip">
          <Icon name="plus" size={16} />
          <span>New trip</span>
        </button>
        <nav className="pl-nav">
          {nav.map((n) => (
            <Link key={n.label} href={n.href} className={n.active ? "is-active" : ""} data-tip={n.label}>
              <Icon name={n.icon} size={18} />
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="pl-recent">
          <p className="pl-label">Recent plans</p>
          {history.length === 0 ? (
            <p className="pl-recent-empty">No trips yet. Plans you make show up here.</p>
          ) : (
            history.map((h) => (
              <button key={h.id} type="button" onClick={() => !busy && (reset(), void start(getDestination(h.destId).name))}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={getDestination(h.destId).card} alt="" />
                <span>{h.title}</span>
              </button>
            ))
          )}
        </div>
        {user ? (
          <Link href="/account" className="pl-user" data-tip="Account">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={user.avatar} alt="" />
            <span>
              <b>{user.name}</b>
              <small>Demo account</small>
            </span>
          </Link>
        ) : (
          <Link href="/login?next=/plan" className="pl-user pl-user-guest" data-tip="Sign in">
            <span className="pl-user-icon">
              <Icon name="user" size={18} />
            </span>
            <span>
              <b>Sign in</b>
              <small>Save trips across devices</small>
            </span>
          </Link>
        )}
      </aside>

      <main className="pl-main">
        <header className="pl-mobilebar">
          <Link href="/" className="logo" aria-label="Tripweave home">
            <LogoMark />
          </Link>
          <span>{dest ? dest.name : "New trip"}</span>
          <div className="pl-mobilebar-actions">
            <button ref={planChip} type="button" className="chip" onClick={() => setPanelOpen(true)} disabled={!dest} aria-expanded={panelOpen}>
              <Icon name="map" /> Plan
            </button>
            <Link href={user ? "/account" : "/login?next=/plan"} className="pl-mobile-account" aria-label={user ? "Account" : "Sign in"}>
              {user ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar} alt="" />
              ) : (
                <Icon name="user" size={18} />
              )}
            </Link>
          </div>
        </header>
        <p className="sr-only" role="status">
          {announce}
        </p>

        <div className="pl-thread" ref={threadRef} data-lenis-prevent>
          {blocks.length === 0 ? (
            <div className="pl-welcome">
              <p className="pl-hi">Hi {firstName}</p>
              <h1>Where do you want to go?</h1>
              <p className="pl-welcome-sub">Name a place or pick one below. I’ll ask four or five quick questions, then do all the searching.</p>
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
                <input id="pl-where" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Kyoto, Lisbon, somewhere warm…" autoComplete="off" />
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
                        onPickDoc={(k) => picker.open(k)}
                        busy={busy}
                        onAnswer={answer}
                        onSkip={skipQuestions}
                        onPick={pickOption}
                        onStart={start}
                        lv={lv}
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
            {panelTab === "todo" && (
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
                <Link href="/checkout" className="btn btn-ember btn-sm">
                  Pay {usd.format(plan.totals.total)}
                  <span className="btn-arrow">
                    <Icon name="arrow" />
                  </span>
                </Link>
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
}: {
  lv: LiveView | null;
  block: Exclude<Block, { role: "user" }>;
  prefs: TripPrefs | null;
  docPrefs: TripPrefs | null;
  onPickDoc: (k: DocKind) => void;
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
          <div className="pl-plan-actions">
            <Link href="/trip" className="btn btn-sm">
              Open itinerary
              <span className="btn-arrow">
                <Icon name="arrow" />
              </span>
            </Link>
            <Link href="/checkout" className="btn btn-sm btn-ghost">
              Pay once
            </Link>
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
