"use client";

import { Icon } from "@/components/brand/Icon";
import { PlatformMark } from "@/components/app/DealPanel";
import type { AlternativeSlot } from "@/features/suppliers/alternatives";
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
 * from. Picking one swaps it in instantly (no new search), and every card,
 * total and the deal panel follow, because they all read the same live plan.
 */
export function LiveOptions({
  slots,
  kind,
  busy,
  onSwap,
}: {
  slots: AlternativeSlot[];
  kind: "flight" | "hotel";
  busy: boolean;
  onSwap: (fromOfferId: string, toOfferId: string) => void;
}) {
  const mine = slots.filter((slot) => slot.kind === kind);
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
                      disabled={busy || selected}
                      aria-pressed={selected}
                      onClick={() => onSwap(slot.currentOfferId, option.offerId)}
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
