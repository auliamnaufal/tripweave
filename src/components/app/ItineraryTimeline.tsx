"use client";

import { useMemo } from "react";
import { BryntumScheduler, type BryntumSchedulerProps } from "@bryntum/scheduler-react";
import { StringHelper, type DomClassList, type EventModel } from "@bryntum/scheduler";
import "@bryntum/scheduler/scheduler.css";
import "@bryntum/scheduler/stockholm-light.css";
import "@bryntum/scheduler/fontawesome/css/fontawesome.css";
import "@bryntum/scheduler/fontawesome/css/solid.css";
import { platformInfo } from "@/features/suppliers/platforms";
import type { TimelineBar, TimelineKind, TimelineModel } from "@/features/timeline/itineraryTimeline";

// The plan on a Bryntum Scheduler: a row per kind of booking, a bar per offer,
// the trip window shaded. Times come from the suppliers, so bars never drag;
// before payment a click opens the swap panel for that kind, after payment
// every bar is locked under the PayPal order. Bars the rebooking agent
// proposes for a refunded slot are drawn as dashed ghosts beside the paid ones.

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const hhmm = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const day = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const MIN_BAR_PX = 170;

const KIND_ICON: Record<TimelineKind, string> = { flight: "fa fa-plane", hotel: "fa fa-bed", activity: "fa fa-compass" };

type Props = {
  model: TimelineModel;
  paid: boolean;
  /** Set while the plan can still change: a bar click opens that kind's options. */
  onPick?: (kind: TimelineKind) => void;
  /** The kinds that have other options to swap to; only those bars are clickable. */
  pickable?: TimelineKind[];
};

/** After payment the icon says what happened: booked, refunded, still going. */
function outcomeIcon(b: TimelineBar): string | null {
  switch (b.outcome?.state) {
    case "booked":
    case "paid-direct":
      return "fa fa-circle-check";
    case "refunded":
      return "fa fa-rotate-left";
    case "failed":
      return "fa fa-circle-exclamation";
    case "pending":
      return "fa fa-hourglass-half";
    case "suggested":
      return "fa fa-wand-magic-sparkles";
    default:
      return null;
  }
}

function bar(record: EventModel): TimelineBar {
  return record.get("bar") as TimelineBar;
}

export default function ItineraryTimeline({ model, paid, onPick, pickable = [] }: Props) {
  // Client-only component (loaded with ssr: false), so window is there on first render.
  const narrow = window.matchMedia("(max-width: 640px)").matches;
  // A fresh array each render; compare by content.
  const pickKey = pickable.join();
  const canPick = (kind: TimelineKind) => !paid && Boolean(onPick) && pickable.includes(kind);
  const config = useMemo<BryntumSchedulerProps>(
    () => ({
      readOnly: true,
      // A trip is a handful of rows; let the page scroll, not the grid.
      autoHeight: true,
      rowHeight: 58,
      barMargin: 8,
      eventStyle: "rounded",
      eventLayout: "stack",
      zoomOnMouseWheel: false,
      zoomOnTimeAxisDoubleClick: false,
      createEventOnDblClick: false,
      enableEventAnimations: false,
      // Whole days on top, six-hour blocks under them; wide enough that a
      // three-hour tour is still a bar you can hit.
      viewPreset: {
        base: "hourAndDay",
        tickWidth: 64,
        displayDateFormat: "HH:mm",
        shiftUnit: "day",
        timeResolution: { unit: "minute", increment: 30 },
        headers: [
          { unit: "day", dateFormat: "ddd MMM D" },
          { unit: "hour", increment: 6, dateFormat: "HH" },
        ],
      },
      columns: [
        {
          text: "",
          field: "name",
          // On a phone the row is just its icon, so the days get the width.
          width: narrow ? 52 : 150,
          sortable: false,
          groupable: false,
          draggable: false,
          renderer: ({ record }: { record: { get: (f: string) => unknown } }) => ({
            className: "tw-tl-row",
            children: [{ tag: "i", className: String(record.get("iconCls")) }, { tag: "span", text: String(record.get("name")) }],
          }),
        },
      ],
      cellMenuFeature: false,
      eventMenuFeature: false,
      scheduleMenuFeature: false,
      eventEditFeature: false,
      eventDragFeature: false,
      eventResizeFeature: false,
      eventDragCreateFeature: false,
      timeRangesFeature: { showHeaderElements: false },
      eventTooltipFeature: {
        template: ({ eventRecord }: { eventRecord: EventModel }) => {
          const b = bar(eventRecord);
          const enc = StringHelper.encodeHtml;
          const source = b.synthetic ? "Sample listing" : `via ${platformInfo(b.supplier).label}`;
          const lines = [
            `<b>${enc(b.name)}</b>`,
            `${enc(day(b.startDate))} · ${enc(hhmm(b.startDate))}–${enc(hhmm(b.endDate))}`,
            `${enc(usd.format(b.costMinorUnits / 100))} · ${enc(source)}`,
          ];
          if (b.conflictsWith.length) lines.push(`<span class="tw-tl-warn">Overlaps ${enc(b.conflictsWith.join(", "))}</span>`);
          if (b.flags.includes("outside-window")) lines.push(`<span class="tw-tl-warn">Outside your travel dates</span>`);
          const o = b.outcome;
          if (o?.state === "booked") lines.push(`<span class="tw-tl-ok">Booked${o.bookingRef ? ` · ref ${enc(o.bookingRef)}` : ""}</span>`);
          if (o?.state === "paid-direct") lines.push(`<span class="tw-tl-ok">Paid straight to the supplier</span>`);
          if (o?.state === "refunded")
            lines.push(`<span class="tw-tl-warn">Couldn't be booked${o.reason ? `: ${enc(o.reason)}` : ""}</span>`, `<span class="tw-tl-ok">${enc(usd.format(b.costMinorUnits / 100))} refunded to your PayPal</span>`);
          if (o?.state === "failed") lines.push(`<span class="tw-tl-warn">Couldn't be booked${o.reason ? `: ${enc(o.reason)}` : ""} · refund pending</span>`);
          if (o?.state === "pending") lines.push(`<span class="tw-tl-tip-foot">Booking in progress</span>`);
          if (o?.state === "suggested")
            lines.push(
              `<span class="tw-tl-suggest-tip">Agent's pick to replace ${enc(o.forTitle)}</span>`,
              enc(o.reason),
              `<span class="tw-tl-tip-foot">A suggestion only: not booked, nothing charged</span>`,
            );
          if (!o) lines.push(paid ? `<span class="tw-tl-tip-foot">Paid with PayPal · locked</span>` : canPick(b.resourceId) ? `<span class="tw-tl-tip-foot">Click to see other options</span>` : "");
          return `<div class="tw-tl-tip">${lines.join("<br>")}</div>`;
        },
      },
      eventRenderer: ({ eventRecord, renderData }) => {
        const b = bar(eventRecord);
        // Add to Bryntum's own classes (b-sch-event and friends); replacing them unstyles the bar.
        (renderData.cls as DomClassList).add({
          [`tw-tl-${b.resourceId}`]: true,
          "tw-tl-conflict": b.flags.includes("conflict"),
          "tw-tl-outside": b.flags.includes("outside-window"),
          "tw-tl-paid": paid,
          "tw-tl-pickable": canPick(b.resourceId),
          "tw-tl-refunded": b.outcome?.state === "refunded",
          "tw-tl-failed": b.outcome?.state === "failed",
          "tw-tl-pending": b.outcome?.state === "pending",
          "tw-tl-suggested": b.outcome?.state === "suggested",
        });
        // A short tour is still something you can read and hit.
        renderData.width = Math.max(renderData.width, MIN_BAR_PX);
        renderData.iconCls = outcomeIcon(b) ?? (paid ? "fa fa-lock" : b.flags.length ? "fa fa-triangle-exclamation" : KIND_ICON[b.resourceId]);
        // Plain text: the widget sets it as text, so offer titles can't inject markup.
        return b.resourceId === "hotel" ? `${b.name}` : `${hhmm(b.startDate)} ${b.name}`;
      },
      onEventClick: ({ eventRecord }) => {
        const kind = bar(eventRecord).resourceId;
        if (canPick(kind)) onPick?.(kind);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- canPick reads exactly these
    [paid, onPick, pickKey, narrow],
  );

  const events = useMemo(
    () =>
      model.bars.map((b) => ({
        id: b.id,
        resourceId: b.resourceId,
        name: b.name,
        startDate: b.startDate,
        endDate: b.endDate,
        bar: b,
      })),
    [model.bars],
  );
  const timeRanges = useMemo(
    () => [{ id: "window", name: "Your travel dates", startDate: model.window.startDate, endDate: model.window.endDate, cls: "tw-tl-window" }],
    [model.window.startDate, model.window.endDate],
  );

  return (
    <div className="tw-tl">
      <BryntumScheduler
        {...config}
        startDate={model.startDate}
        endDate={model.endDate}
        resources={model.rows}
        events={events}
        timeRanges={timeRanges}
      />
    </div>
  );
}
