"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { historyStore, tripStore, useHistory, useUser } from "@/features/ui-mock/tripStore";
import { gsap, useGSAP } from "@/lib/gsap";

type StepStatus = "pending" | "running" | "done";
type Step = { id: string; tool: string; label: string; status: StepStatus; result?: string; preview?: "flights" | "hotels" | "activities" };

type Block =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "agent"; kind: "typing" }
  | { id: string; role: "agent"; kind: "text"; text: string; streaming: boolean }
  | { id: string; role: "agent"; kind: "question"; qid: QuestionId; text: string; options: string[]; multi: boolean; done: boolean; picked: string[] }
  | { id: string; role: "agent"; kind: "brief" }
  | { id: string; role: "agent"; kind: "work"; title: string; steps: Step[]; done: boolean }
  | { id: string; role: "agent"; kind: "flights" | "hotels" | "food" | "days" | "plan" | "places" };

const nav: { icon: IconName; label: string; href: string; active?: boolean }[] = [
  { icon: "chat", label: "Planner", href: "/plan", active: true },
  { icon: "ticket", label: "My trips", href: "/account?tab=trips" },
  { icon: "heart", label: "Saved places", href: "/account?tab=saved" },
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
};

let uid = 0;
const session = Math.random().toString(36).slice(2, 7);
const nid = () => `b${session}${++uid}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pickRandom = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const stamp = () => ({ id: String(Date.now()), at: new Date().toISOString() });

export function Planner() {
  const params = useSearchParams();
  const user = useUser();
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

  const root = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const prefsRef = useRef<TripPrefs | null>(null);
  const alive = useRef(true);
  const started = useRef(false);

  const dest = prefs ? getDestination(prefs.destId) : null;
  const plan = useMemo(() => (prefs ? buildPlan(prefs) : null), [prefs]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

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
      gsap.from(".pl-side > *", { x: -16, opacity: 0, stagger: 0.04, duration: 0.8, ease: "expo.out" });
      gsap.from(".pl-welcome > *", { y: 28, opacity: 0, stagger: 0.07, duration: 1.1, ease: "expo.out", delay: 0.1 });
      gsap.from(".pl-place", { y: 30, opacity: 0, stagger: 0.05, duration: 1, ease: "expo.out", delay: 0.35 });
    },
    { scope: root },
  );

  const push = useCallback((b: Block) => setBlocks((prev) => [...prev, b]), []);
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

  async function askQuestion(i: number, d: Destination, p: TripPrefs) {
    const q = questions[i];
    const tid = nid();
    push({ id: tid, role: "agent", kind: "typing" });
    await sleep(550);
    remove(tid);
    push({ id: nid(), role: "agent", kind: "question", qid: q.id, text: q.ask(d, p), options: q.options, multi: !!q.multi, done: false, picked: [] });
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
    await sleep(500);
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
    await say(planSummary(pl, fit.adjusted), 300);
    push({ id: nid(), role: "agent", kind: "flights" });
    await sleep(250);
    push({ id: nid(), role: "agent", kind: "hotels" });
    await sleep(250);
    push({ id: nid(), role: "agent", kind: "plan" });
    setSuggestions(suggestionsFor(pl, "plan"));
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

  async function pickOption(kind: "flight" | "hotel", idx: number) {
    const p = prefsRef.current;
    if (!p || busy) return;
    const d = getDestination(p.destId);
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

  function submit(text: string) {
    const value = text.trim();
    if (!value) return;
    setInput("");
    if (!prefsRef.current || blocks.length === 0) return void start(value);
    const q = qIndex !== null ? questions[qIndex] : null;
    if (q) return void answer(q.id, value);
    if (planned) return void refine(value);
    return void start(value);
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

  useEffect(() => {
    const q = params.get("q");
    if (q && !started.current) {
      started.current = true;
      void start(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const activeQuestion = qIndex !== null ? questions[qIndex] : null;
  const placeholder = activeQuestion ? activeQuestion.placeholder : planned ? "Ask for a change: cheaper, slower, more food…" : "Name a place…";

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
          <button type="button" className="chip" onClick={() => setPanelOpen(true)} disabled={!dest}>
            <Icon name="map" /> Plan
          </button>
        </header>

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
                      <p>{b.text}</p>
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
                        busy={busy}
                        onAnswer={answer}
                        onSkip={skipQuestions}
                        onPick={pickOption}
                        onStart={start}
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
                      <button key={s} type="button" onClick={() => refine(s)}>
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
            <div className="pl-input">
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
            <p className="pl-fine">Demo data. Prices are checked by code, not the model, and nothing is charged until you approve.</p>
          </form>
        )}
      </main>

      <aside className={`pl-panel ${panelOpen ? "is-open" : ""}`} aria-label="Trip details" data-lenis-prevent>
        <button type="button" className="pl-panel-close" onClick={() => setPanelOpen(false)} aria-label="Close plan">
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
              <img src={dest.card} alt={dest.name} />
              <div>
                <h2>{dest.name}</h2>
                <span>
                  <Icon name="pin" size={14} /> {dest.country}
                </span>
              </div>
              <button type="button" className="pl-dest-fav" aria-label="Save">
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
            <div className="pl-tabs" role="tablist">
              {(["overview", "todo", "map"] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={panelTab === t} className={panelTab === t ? "is-active" : ""} onClick={() => setPanelTab(t)}>
                  {t === "overview" ? "Overview" : t === "todo" ? "Things to do" : "Map"}
                </button>
              ))}
            </div>

            {panelTab === "overview" && (
              <div className="pl-tab-body">
                <div className="pl-budget">
                  <div className="pl-budget-top">
                    <span className="pl-label">Budget</span>
                    <span>{stage >= 4 ? `${usd.format(plan.totals.total)} / ${usd.format(plan.prefs.budget)}` : stage > 0 ? "Calculating…" : "Waiting for answers"}</span>
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
                      <b>{stage >= 3 ? `${plan.activities.length} activities` : "Things to do"}</b>
                      <small>{stage >= 3 ? plan.activities.map((a) => a.title.split(" ")[0]).join(" · ") : "Matching your vibe"}</small>
                    </span>
                    <em>{stage >= 3 ? usd.format(plan.totals.activities) : ""}</em>
                  </li>
                </ul>
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
                  <img src="/images/app-map.webp" alt="Map placeholder" />
                  {[plan.hotel.area, ...plan.activities.map((a) => a.title)].slice(0, 4).map((label, i) => (
                    <span key={label} style={{ left: `${24 + i * 15}%`, top: `${30 + ((i * 17) % 40)}%` }}>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
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

function AgentBlock({
  block,
  prefs,
  busy,
  onAnswer,
  onSkip,
  onPick,
  onStart,
}: {
  block: Exclude<Block, { role: "user" }>;
  prefs: TripPrefs | null;
  busy: boolean;
  onAnswer: (q: QuestionId, v: string) => void;
  onSkip: () => void;
  onPick: (k: "flight" | "hotel", i: number) => void;
  onStart: (t: string) => void;
}) {
  const [multi, setMulti] = useState<string[]>([]);
  const plan = prefs ? buildPlan(prefs) : null;

  if (block.kind === "typing") {
    return (
      <span className="pl-typing" aria-label="Agent is typing">
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
            {plan.prefs.when} · {plan.prefs.travelerLabel} · {plan.activities.length} activities
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
