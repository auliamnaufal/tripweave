"use client";

import { Icon, type IconName } from "@/components/brand/Icon";
import type { DealSummary } from "@/features/suppliers/deal";
import "./deal.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd = (minor: number) => money.format(minor / 100);

const kindIcon: Record<string, IconName> = { flight: "plane", hotel: "bed", activity: "compass" };

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

      <ul className="deal-items">
        {deal.items.map((item) => (
          <li key={item.offerId}>
            <Icon name={kindIcon[item.kind] ?? "spark"} size={15} />
            <span className="deal-item-title">{item.title}</span>
            <span className="deal-item-via">
              via <b>{item.chosen.label}</b>
              {item.platformsCompared > 1 ? ` · best of ${item.platformsCompared}` : ""}
            </span>
            <span className="deal-item-price">
              {usd(item.chosen.costMinorUnits)}
              {item.savedMinorUnits > 0 && <small>−{usd(item.savedMinorUnits)}</small>}
            </span>
          </li>
        ))}
      </ul>

      {deal.tips.map((tip) => (
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

      {deal.cheaperElsewhere.map((item) => (
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
