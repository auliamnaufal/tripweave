"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/brand/Icon";
import type { TripBriefWire } from "@/features/live/client";
import type { LivePlan } from "@/features/live/liveStore";
import { replan } from "@/features/live/planEditor";
import { briefProblem } from "@/features/planner/tripBrief";
import "./edit-trip.css";

const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Changing the trip itself (dates, nights, travellers, budget) means new
 * prices, so it runs a fresh search — a few seconds, shown step by step —
 * instead of an instant swap. Nothing changes until the new plan arrives.
 */
export function EditTripDialog({ live, onClose }: { live: LivePlan; onClose: () => void }) {
  const brief = live.brief;
  const stops = brief.stops ?? null;
  const [start, setStart] = useState(brief.travelWindow.startsAt.slice(0, 10));
  // Calendar nights: the window ends at 23:59:59 on the last day, so count dates, not hours.
  const [nights, setNights] = useState(() =>
    Math.max(1, Math.round((Date.parse(`${brief.travelWindow.endsAt.slice(0, 10)}T00:00:00Z`) - Date.parse(`${brief.travelWindow.startsAt.slice(0, 10)}T00:00:00Z`)) / DAY_MS)),
  );
  const [stopNights, setStopNights] = useState<number[]>(() => stops?.map((s) => s.nights) ?? []);
  const [travelers, setTravelers] = useState(brief.travelers);
  const [budget, setBudget] = useState(Math.round(brief.hardBudget.amountMinorUnits / 100));
  const [steps, setSteps] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const card = useRef<HTMLFormElement>(null);

  useEffect(() => {
    card.current?.querySelector<HTMLElement>("input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !working) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, working]);

  const totalNights = stops ? stopNights.reduce((sum, n) => sum + n, 0) : nights;
  const [minStart] = useState(() => isoDay(Date.now() + 2 * DAY_MS));

  async function submit() {
    const startMs = Date.parse(`${start}T00:00:00Z`);
    const next: TripBriefWire = {
      ...brief,
      travelers,
      travelWindow: { startsAt: `${start}T00:00:00Z`, endsAt: `${isoDay(startMs + totalNights * DAY_MS)}T23:59:59Z` },
      hardBudget: { currency: "USD", amountMinorUnits: Math.round(budget * 100) },
      ...(stops ? { stops: stops.map((stop, i) => ({ ...stop, nights: stopNights[i] })) } : {}),
      ...(brief.dayPlans ? { dayPlans: brief.dayPlans.filter((plan) => plan.day <= totalNights + 1) } : {}),
    };
    const problem = Number.isFinite(startMs) ? briefProblem(next) : "Pick a start date.";
    if (problem) return setError(problem);
    setError("");
    setWorking(true);
    setSteps(["Sending the new dates to the agent"]);
    try {
      await replan(
        next,
        {
          nights: totalNights,
          travelers,
          travelerLabel: travelers === 1 ? "Just me" : `${travelers} travellers`,
          budget,
          when: new Date(startMs).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
        },
        (label) => setSteps((s) => (s.includes(label) ? s : [...s, label])),
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The planner is unavailable. Your current plan is unchanged.");
      setWorking(false);
    }
  }

  return (
    <div className="et-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !working && onClose()}>
      <form
        ref={card}
        className="et-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="et-title"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <header className="et-head">
          <h2 id="et-title">Edit trip</h2>
          <button type="button" className="et-close" onClick={onClose} disabled={working} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>
        <p className="et-sub">New dates or travellers mean new fares, so the agent searches again. Your current plan stays until the new one is ready.</p>

        <fieldset className="et-fields" disabled={working}>
          <label>
            <span>Start date</span>
            <input type="date" value={start} min={minStart} onChange={(e) => setStart(e.target.value)} required />
          </label>
          {stops ? (
            stops.map((stop, i) => (
              <label key={stop.city}>
                <span>Nights in {stop.city}</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={stopNights[i]}
                  onChange={(e) => setStopNights((all) => all.map((n, k) => (k === i ? Math.max(1, Number(e.target.value) || 1) : n)))}
                />
              </label>
            ))
          ) : (
            <label>
              <span>Nights</span>
              <input type="number" min={1} max={30} value={nights} onChange={(e) => setNights(Math.max(1, Number(e.target.value) || 1))} />
            </label>
          )}
          <label>
            <span>Travellers</span>
            <input type="number" min={1} max={9} value={travelers} onChange={(e) => setTravelers(Math.min(9, Math.max(1, Number(e.target.value) || 1)))} />
          </label>
          <label>
            <span>Budget (USD)</span>
            <input type="number" min={100} step={50} value={budget} onChange={(e) => setBudget(Math.max(1, Number(e.target.value) || 1))} />
          </label>
        </fieldset>

        {working && (
          <ol className="et-steps" aria-live="polite">
            {steps.map((label, i) => (
              <li key={label} className={i === steps.length - 1 ? "is-running" : "is-done"}>
                {i === steps.length - 1 ? <span className="lo-dot" aria-hidden="true" /> : <Icon name="check" size={12} />} {label}
              </li>
            ))}
          </ol>
        )}
        {error && (
          <p className="et-error" role="alert">
            {error}
          </p>
        )}

        <footer className="et-foot">
          <span className="et-summary">
            {totalNights} {totalNights === 1 ? "night" : "nights"} · {travelers} {travelers === 1 ? "traveller" : "travellers"}
          </span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} disabled={working}>
            Cancel
          </button>
          <button type="submit" className="btn btn-sm btn-ember" disabled={working}>
            {working ? "Re-planning…" : "Update plan"}
          </button>
        </footer>
      </form>
    </div>
  );
}
