"use client";

import { Icon, type IconName } from "@/components/brand/Icon";
import type { DealSummary } from "@/features/suppliers/deal";
import { platformInfo } from "@/features/suppliers/platforms";
import "./deal.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd = (minor: number) => money.format(minor / 100);

const kindIcon: Record<string, IconName> = { flight: "plane", hotel: "bed", activity: "compass" };
const kindLabel: Record<string, string> = { flight: "Flight", hotel: "Hotel", activity: "Activity" };

// A monogram per platform, not a brand logo: simulated partners are fictional,
// and real platforms' marks aren't ours to reuse.
const MARK_TONES = ["forest", "ember", "sky", "sand", "moss", "ink"] as const;
function tone(supplier: string): (typeof MARK_TONES)[number] {
  let hash = 0;
  for (const char of supplier) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return MARK_TONES[hash % MARK_TONES.length];
}

export function PlatformMark({ supplier, label, small = false }: { supplier: string; label: string; small?: boolean }) {
  const initials = label
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const simulated = platformInfo(supplier).data === "simulated";
  return (
    <span className={`pmark is-${tone(supplier)} ${simulated ? "is-simulated" : ""} ${small ? "is-small" : ""}`} aria-hidden="true">
      {initials}
    </span>
  );
}

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** One line for the planner's plan card. */
export function DealLine({ deal }: { deal: DealSummary }) {
  const searched = deal.platforms.filter((platform) => platform.status === "ok").length;
  return (
    <p className="deal-line">
      <Icon name="spark" size={14} /> Searched {searched} platforms · {deal.offersCompared} offers compared
      {deal.savedMinorUnits > 0 ? <> · <b>{usd(deal.savedMinorUnits)} saved</b></> : null}
    </p>
  );
}

/**
 * What the deal hunt did, as fact: every figure comes from the search the
 * server ran, not from the model's note. Simulated partners are labelled.
 */
export function DealPanel({ deal }: { deal: DealSummary }) {
  const searched = deal.platforms.filter((platform) => platform.status === "ok");
  return (
    <section className="deal" aria-labelledby="deal-title">
      <header className="deal-head">
        <div>
          <p className="deal-kicker">Deal hunt</p>
          <h3 id="deal-title" className="deal-title">
            {searched.length} platforms searched · {deal.offersCompared} offers compared
          </h3>
        </div>
        {deal.savedMinorUnits > 0 && (
          <p className="deal-saved">
            <b>{usd(deal.savedMinorUnits)}</b>
            <span>saved vs. the priciest platform for the same items</span>
          </p>
        )}
      </header>

      <ul className="deal-cards">
        {deal.items.map((item) => (
          <li key={item.offerId} className="deal-card">
            <div className="deal-card-head">
              <span className="deal-card-kind">
                <Icon name={kindIcon[item.kind] ?? "spark"} size={14} /> {kindLabel[item.kind] ?? item.kind}
              </span>
              <span className="deal-card-price">{usd(item.chosen.costMinorUnits)}</span>
            </div>
            <p className="deal-card-title">{item.title}</p>
            <p className="deal-card-best">
              <PlatformMark supplier={item.chosen.supplier} label={item.chosen.label} />
              <span>
                Best deal on <b>{item.chosen.label}</b>
                {item.platformsCompared > 1 ? ` · cheapest of ${item.platformsCompared} platforms` : ""}
              </span>
              {item.savedMinorUnits > 0 && <em className="deal-card-saved">saved {usd(item.savedMinorUnits)}</em>}
            </p>
            {item.sourceLabel && <p className="deal-card-source">Inventory from {item.sourceLabel}, resold by {item.chosen.label}</p>}
            {(item.options ?? []).length > 1 && (
              <ol className="deal-card-options" aria-label={`Prices for ${item.title}`}>
                {(item.options ?? []).map((option) => (
                  <li key={option.supplier} className={option.chosen ? "is-chosen" : ""} title={option.terms ?? undefined}>
                    <PlatformMark supplier={option.supplier} label={option.label} small />
                    <span className="deal-opt-name">
                      {option.label}
                      {option.role === "deeplink" ? " · price check" : ""}
                    </span>
                    <span className="deal-opt-price">{usd(option.costMinorUnits)}</span>
                    {option.chosen && <span className="deal-opt-tag">Chosen</span>}
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>

      {(deal.tips ?? []).map((tip) => (
        <p key={`${tip.route}-${tip.date}`} className="deal-tip">
          <Icon name="calendar" size={15} /> Flying {tip.route.replace("-", " → ")} on <b>{dayLabel(tip.betterDate)}</b> instead of {dayLabel(tip.date)}: market fares
          from {usd(tip.marketFareMinorUnits)} vs. {usd(tip.bookableMinorUnits)} on your date ({tip.source}).
          {tip.listingUrl && (
            <>
              {" "}
              <a href={tip.listingUrl} target="_blank" rel="noopener noreferrer sponsored">
                See fare
              </a>
            </>
          )}
        </p>
      ))}

      {(deal.cheaperElsewhere ?? []).map((item) => (
        <p key={`${item.route}-${item.date}-cheaper`} className="deal-tip">
          <Icon name="arrow" size={15} /> A fare on {item.route.replace("-", " → ")} for {usd(item.fare.costMinorUnits)} was seen on Aviasales that day, below what partners can sell
          ({usd(item.bookableMinorUnits)}).{" "}
          {item.fare.listingUrl && (
            <a href={item.fare.listingUrl} target="_blank" rel="noopener noreferrer sponsored">
              Book it there
            </a>
          )}
        </p>
      ))}

      <ul className="deal-platforms" aria-label="Platforms searched">
        {deal.platforms.map((platform) => (
          <li key={platform.supplier} className={`deal-chip is-${platform.data} ${platform.status === "ok" ? "" : "is-down"}`}>
            <PlatformMark supplier={platform.supplier} label={platform.label} small />
            {platform.label}
            <small>
              {platform.role === "deeplink" ? "price check" : platform.data === "simulated" ? "simulated partner" : "live API"}
              {platform.status === "ok" ? ` · ${platform.offers}` : ` · ${platform.status}`}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}
