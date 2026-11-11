"use client";

import { useState } from "react";
import { Icon } from "@/components/brand/Icon";
import { PlatformMark } from "@/components/app/DealPanel";
import { useLivePlan } from "@/features/live/liveStore";
import { activityBlocker, swapChoice, syncEdits, toggleActivity } from "@/features/live/planEditor";
import "./deal.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd = (minor: number) => money.format(minor / 100);

function hhmm(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

function day(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "";
}

/**
 * Real options for each flight leg or stay, from the same search the plan came
 * from. A tap swaps it in on the spot: the itinerary, totals and every other
 * screen follow at once, and the change is saved in the background.
 */
export function LiveOptions({ kind, onChange }: { kind: "flight" | "hotel"; onChange?: (message: string | null) => void }) {
  const live = useLivePlan();
  const mine = live?.alternatives?.filter((slot) => slot.kind === kind) ?? [];
  if (mine.length === 0) return null;
  return (
    <div className="pl-options-card lo">
      {mine.map((slot) => {
        const current = slot.options.find((option) => option.offerId === slot.currentOfferId);
        return (
          <section key={slot.slot} className="lo-slot" aria-label={slot.label}>
            <p className="pl-card-title">
              <Icon name={kind === "flight" ? "plane" : "bed"} size={15} /> {slot.label}
              <small className="lo-count">{slot.options.length} options across platforms</small>
            </p>
            <ul className="lo-list">
              {slot.options.map((option) => {
                const selected = option.offerId === slot.currentOfferId;
                const diff = current ? option.costMinorUnits - current.costMinorUnits : 0;
                return (
                  <li key={option.offerId}>
                    <button
                      type="button"
                      className={`lo-opt ${selected ? "is-selected" : ""}`}
                      aria-pressed={selected}
                      onClick={() => {
                        if (selected) return;
                        onChange?.(swapChoice(slot.currentOfferId, option.offerId));
                      }}
                    >
                      <PlatformMark supplier={option.platform.supplier} label={option.platform.label} />
                      <span className="lo-body">
                        <b>{kind === "flight" ? `${hhmm(option.startsAt)} → ${hhmm(option.endsAt)} · ${day(option.startsAt)}` : option.title}</b>
                        <small>
                          {kind === "flight" ? option.summary.split(" · ")[0].split(", ")[0] : option.summary.split(" · ").slice(0, 2).join(" · ")}
                        </small>
                        <small className="lo-platform">
                          {option.platform.label}
                          {option.platform.data === "simulated" ? " · simulated partner" : ""}
                          {option.cancellationTerms ? ` · ${option.cancellationTerms.replace(/\.$/, "")}` : ""}
                        </small>
                      </span>
                      <span className="lo-price">
                        {usd(option.costMinorUnits)}
                        {selected ? (
                          <em className="lo-tag is-selected">
                            <Icon name="check" size={11} /> Selected
                          </em>
                        ) : (
                          <em className={`lo-tag ${diff < 0 ? "is-less" : ""}`}>{diff === 0 ? "Same price" : `${diff < 0 ? "−" : "+"}${usd(Math.abs(diff))}`}</em>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Things to do from the same search: tap to add one to its day, tap again to take it out. */
export function ActivityOptions({ onChange }: { onChange?: (message: string | null) => void }) {
  const live = useLivePlan();
  const options = live?.activityOptions ?? [];
  if (!live || options.length === 0) return null;
  const inPlan = new Set(live.plan.offers.map((offer) => offer.id));
  return (
    <div className="pl-options-card lo">
      <section className="lo-slot" aria-label="Things to do">
        <p className="pl-card-title">
          <Icon name="compass" size={15} /> Things to do
          <small className="lo-count">{[...inPlan].filter((id) => options.some((o) => o.offerId === id)).length} in your plan</small>
        </p>
        <ul className="lo-list">
          {options.map((option) => {
            const selected = inPlan.has(option.offerId);
            const blocked = selected ? null : activityBlocker(live, option.offerId);
            return (
              <li key={option.offerId}>
                <button
                  type="button"
                  className={`lo-opt lo-act ${selected ? "is-selected" : ""}`}
                  aria-pressed={selected}
                  disabled={Boolean(blocked)}
                  title={blocked ?? undefined}
                  onClick={() => onChange?.(toggleActivity(option.offerId))}
                >
                  <PlatformMark supplier={option.platform.supplier} label={option.platform.label} />
                  <span className="lo-body">
                    <b>{option.title}</b>
                    <small>
                      {day(option.startsAt)} · {hhmm(option.startsAt)}–{hhmm(option.endsAt)}
                    </small>
                    <small className="lo-platform">{blocked ?? `${option.platform.label}${option.platform.data === "simulated" ? " · simulated partner" : ""}`}</small>
                  </span>
                  <span className="lo-price">
                    {option.costMinorUnits ? usd(option.costMinorUnits) : "Free"}
                    <em className={`lo-tag ${selected ? "is-selected" : ""}`}>
                      {selected ? (
                        <>
                          <Icon name="check" size={11} /> Added · tap to remove
                        </>
                      ) : (
                        "+ Add"
                      )}
                    </em>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/** "Saving…" while an edit becomes a payable quote, and why it couldn't, if it couldn't. */
export function EditStatus({ message }: { message?: string | null }) {
  const live = useLivePlan();
  const [retrying, setRetrying] = useState(false);
  const error = message || live?.syncError;
  if (!live?.syncing && !error) return null;
  return (
    <p className={`lo-status ${error ? "is-error" : ""}`} role="status" aria-live="polite">
      {error ? (
        <>
          <Icon name="close" size={13} /> {error}
          {live?.syncing && (
            <button
              type="button"
              disabled={retrying}
              onClick={() => {
                setRetrying(true);
                void syncEdits().finally(() => setRetrying(false));
              }}
            >
              Try again
            </button>
          )}
        </>
      ) : (
        <>
          <span className="lo-dot" aria-hidden="true" /> Saving your changes…
        </>
      )}
    </p>
  );
}
