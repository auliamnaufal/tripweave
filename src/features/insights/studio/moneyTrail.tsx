"use client";

import { use, useMemo } from "react";
import { AgIncompleteDataMappingOverlay, AgNoDataOverlay, type AgRegistry, type AgWidgetDefinition } from "ag-studio-react";
import type { AgDefaultRegistry, AgWidgetData, AgWidgetDataFormat, AgWidgetDataResponse, AgWidgetFieldReference, AgWidgetParams } from "ag-studio";

// A custom AG Studio widget: one bar per Trip Order, split into what the
// PayPal payment became (Booked, Refunded, Failed, Pending). Every bar is the
// whole captured amount, so a refund reads as part of the same payment rather
// than as money that vanished: the same rule capture enforces (paid = booked +
// refunded + pending).

type MoneyTrailMapping = { trip: AgWidgetFieldReference[]; outcome: AgWidgetFieldReference[]; amount: AgWidgetFieldReference[] };
export interface MoneyTrailState extends AgWidgetData<MoneyTrailMapping, AgWidgetDataFormat<unknown>> {
  type: "money-trail";
}
export type MoneyTrailDefinition = AgWidgetDefinition<"money-trail", MoneyTrailState>;

export interface TripInsightsRegistry extends AgRegistry {
  widgets: readonly (AgDefaultRegistry["widgets"][number] | MoneyTrailDefinition)[];
}

const ORDER = ["Booked", "Paid direct", "Pending", "Failed", "Refunded"] as const;
const COLOR: Record<string, string> = {
  Booked: "var(--forest-700)",
  "Paid direct": "var(--forest-500)",
  Pending: "var(--paper-3)",
  Failed: "#b42318",
  Refunded: "repeating-linear-gradient(135deg, var(--sand) 0 6px, #e2d3b4 6px 12px)",
};
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

type Trail = { trip: string; total: number; parts: { outcome: string; amount: number }[] };

/** Rows of (trip, outcome, sum) → one trail per trip, segments in a fixed order. */
export function toTrails(rows: { trip: string; outcome: string; amount: number }[]): Trail[] {
  const byTrip = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const parts = byTrip.get(row.trip) ?? new Map<string, number>();
    parts.set(row.outcome, (parts.get(row.outcome) ?? 0) + (Number(row.amount) || 0));
    byTrip.set(row.trip, parts);
  }
  return [...byTrip].map(([trip, parts]) => {
    const ordered = [...parts].sort(([a], [b]) => rank(a) - rank(b)).map(([outcome, amount]) => ({ outcome, amount }));
    return { trip, total: ordered.reduce((s, p) => s + p.amount, 0), parts: ordered };
  });
}
const rank = (outcome: string) => {
  const i = (ORDER as readonly string[]).indexOf(outcome);
  return i < 0 ? ORDER.length : i;
};

function MoneyTrail({ dataMapping, widgetApi }: AgWidgetParams<MoneyTrailState>) {
  const trip = dataMapping.trip?.[0];
  const outcome = dataMapping.outcome?.[0];
  const amount = dataMapping.amount?.[0];
  const request = useMemo(
    () => (trip && outcome && amount ? widgetApi.getData({ kind: "flat", fields: [trip, outcome, amount] }, { queryId: "trail" }) : null),
    [widgetApi, trip, outcome, amount],
  );
  if (!request || !trip || !outcome || !amount) return <AgIncompleteDataMappingOverlay />;
  return <TrailBars response={use(request)} keys={{ trip: trip.key, outcome: outcome.key, amount: amount.key }} />;
}

function TrailBars({ response, keys }: { response: AgWidgetDataResponse; keys: { trip: string; outcome: string; amount: string } }) {
  if (response.replaced) return null;
  const trails = toTrails(response.results.rows.map((row) => ({ trip: String(row[keys.trip] ?? "—"), outcome: String(row[keys.outcome] ?? "Pending"), amount: Number(row[keys.amount] ?? 0) })));
  if (trails.length === 0) return <AgNoDataOverlay />;
  const present = ORDER.filter((o) => trails.some((t) => t.parts.some((p) => p.outcome === o)));

  return (
    <div className="mt-widget">
      <ul className="mt-rows">
        {trails.map((t) => (
          <li key={t.trip} className="mt-row">
            <span className="mt-trip">{t.trip}</span>
            <span className="mt-bar" role="img" aria-label={`${t.trip}: ${t.parts.map((p) => `${p.outcome} ${usd.format(p.amount)}`).join(", ")}`}>
              {t.parts.map((p) => (
                <i
                  key={p.outcome}
                  className={`mt-seg mt-${p.outcome.toLowerCase().replace(/\s+/g, "-")}`}
                  style={{ flexGrow: p.amount, background: COLOR[p.outcome] ?? "var(--ink-soft)" }}
                  title={`${p.outcome}: ${usd.format(p.amount)}`}
                >
                  {t.total > 0 && p.amount / t.total > 0.14 ? usd.format(p.amount) : ""}
                </i>
              ))}
            </span>
            <b className="mt-total">{usd.format(t.total)}</b>
          </li>
        ))}
      </ul>
      <ul className="mt-legend">
        {present.map((o) => (
          <li key={o}>
            <i style={{ background: COLOR[o] }} /> {o === "Refunded" ? "Refunded to your PayPal" : o}
          </li>
        ))}
      </ul>
    </div>
  );
}

export const moneyTrailWidget: MoneyTrailDefinition = {
  id: "money-trail",
  label: "PayPal money trail",
  icon: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="9" height="3" rx="1"/><rect x="10" y="3" width="5" height="3" rx="1" opacity=".5"/><rect x="1" y="10" width="12" height="3" rx="1"/><rect x="13" y="10" width="2" height="3" rx="1" opacity=".5"/></svg>',
  dataMapping: {
    trip: { type: "field", supportedRoles: ["category"], requires: { cardinality: "many" }, required: true, aiDescription: "The Trip Order each bar stands for (bookings.trip)." },
    outcome: {
      type: "field",
      supportedRoles: ["category"],
      requires: { cardinality: "many" },
      required: true,
      aiDescription: "What each line became after capture (bookings.outcome).",
    },
    amount: {
      type: "field",
      supportedRoles: ["numeric"],
      requires: { per: "dataMapping.trip", cardinality: "one" },
      required: true,
      aiDescription: "Amount paid for each line, summed (bookings.amountUsd).",
    },
  },
  form: (params) =>
    params.createDefaults({
      dataMappingItems: [
        { key: "trip", label: "Trip" },
        { key: "outcome", label: "Outcome" },
        { key: "amount", label: "Amount" },
      ],
    }),
  comp: MoneyTrail,
  defaultSize: { width: 24, height: 12 },
  minSize: { width: 12, height: 8 },
  ai: {
    label: "PayPal money trail",
    description: "One bar per paid Trip Order, split into Booked, Pending, Failed and Refunded amounts; each bar adds up to what PayPal captured.",
    usage: "Use to show where a traveller's PayPal payments went, especially refunds.",
  },
};
