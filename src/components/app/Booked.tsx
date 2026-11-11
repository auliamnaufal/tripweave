"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppTopbar } from "@/components/app/AppTopbar";
import { Icon, type IconName } from "@/components/brand/Icon";
import { usd } from "@/features/ui-mock/data";
import { ordersStore, useHydrated } from "@/features/ui-mock/tripStore";
import { streamCapture } from "@/features/live/client";
import { livePaymentStore, type LivePayment } from "@/features/live/liveStore";
import { isLive, useTripView, type AnyTripView } from "@/features/live/useTripView";
import type { TravelOfferView } from "@/features/planner/travelOffer";
import { gsap, prefersReducedMotion, SplitText, useGSAP } from "@/lib/gsap";
import { BookedSkeleton } from "@/components/app/Skeleton";

type Status = "queued" | "booking" | "booked" | "failed" | "refunded";
type Kind = "flight" | "hotel" | "activity";
type Row = { id: string; kind: Kind; icon: IconName; label: string; supplier: string; status: Status; detail: string };

const kindIcon: Record<Kind, IconName> = { flight: "plane", hotel: "bed", activity: "compass" };
const toolKind: Record<string, Kind> = { book_flight: "flight", book_hotel: "hotel", book_activity: "activity" };

function placeholderRows(view: AnyTripView): Row[] {
  const ref = (seed: string) => seed.replace(/[^A-Z0-9]/gi, "").slice(0, 3).toUpperCase() + String(1000 + ((seed.length * 7919) % 9000));
  const [out, back] = view.flights;
  const rows: Omit<Row, "status">[] = [
    { id: "f1", kind: "flight", icon: "plane", label: `${out.from} → ${out.to}`, supplier: out.airline, detail: ref(out.code) },
    { id: "h1", kind: "hotel", icon: "bed", label: view.hotel.name, supplier: `${view.hotel.nights} nights · ${view.hotel.area}`, detail: ref(view.hotel.name) },
    ...view.activities.map((a) => ({ id: a.id, kind: "activity" as Kind, icon: "compass" as IconName, label: a.title, supplier: a.tag, detail: ref(a.title) })),
  ];
  if (back) rows.push({ id: "f2", kind: "flight", icon: "plane", label: `${back.from} → ${back.to}`, supplier: back.airline, detail: ref(back.code + "r") });
  return rows.map((r) => ({ ...r, status: "queued" }));
}

function liveRows(offers: TravelOfferView[]): Row[] {
  const order: Kind[] = ["flight", "hotel", "activity"];
  return [...offers]
    .sort((a, b) => order.indexOf(a.productKind) - order.indexOf(b.productKind) || Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .map((o) => ({
      id: o.id,
      kind: o.productKind,
      icon: kindIcon[o.productKind],
      label: o.title,
      supplier: o.synthetic ? "Sample supplier" : o.supplier === "duffel" ? "Duffel (test mode)" : o.supplier,
      status: "queued",
      detail: "",
    }));
}

type CaptureState = { rows: Row[]; payment: string; error: string; done: boolean; refunded: number };

const captureKey = (orderId: string) => `tw-capture-${orderId}`;

export function Booked() {
  const hydrated = useHydrated();
  const view = useTripView();
  if (!hydrated) return <BookedSkeleton />;
  return <BookedInner view={view} payment={isLive(view) ? livePaymentStore.get() : null} />;
}

function BookedInner({ view, payment }: { view: AnyTripView; payment: LivePayment | null }) {
  const live = isLive(view) && payment !== null;
  const root = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const [state, setState] = useState<CaptureState>(() => {
    if (live && payment) {
      try {
        const saved = window.localStorage.getItem(captureKey(payment.orderId));
        if (saved) return JSON.parse(saved) as CaptureState;
      } catch {
        /* ignore */
      }
      return { rows: liveRows(view.offers), payment: "Confirming your PayPal payment…", error: "", done: false, refunded: 0 };
    }
    return { rows: placeholderRows(view), payment: "", error: "", done: false, refunded: 0 };
  });
  const rows = state.rows;
  const orderLabel = live && payment ? payment.orderId : `TW-${view.plan.prefs.destId.toUpperCase().slice(0, 3)}${view.total}`;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (state.done) return;

    const record = () => {
      const orders = ordersStore.get();
      if (!orders.some((o) => o.id === orderLabel)) {
        ordersStore.set([{ id: orderLabel, title: view.title, destId: view.plan.prefs.destId, total: view.total, at: new Date().toISOString(), items: rows.length }, ...orders]);
      }
    };

    if (live && payment && isLive(view)) {
      const update = (fn: (s: CaptureState) => CaptureState) =>
        setState((s) => {
          const next = fn(s);
          try {
            window.localStorage.setItem(captureKey(payment.orderId), JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });
      // Errors are not persisted, so the traveller can approve in PayPal and retry.
      const fail = (message: string) => {
        setState((s) => ({ ...s, error: message, done: true }));
        try {
          window.localStorage.removeItem(captureKey(payment.orderId));
        } catch {
          /* ignore */
        }
      };
      const setRow = (match: (r: Row) => boolean, patch: Partial<Row>) =>
        update((s) => {
          const i = s.rows.findIndex(match);
          if (i === -1) return s;
          const next = [...s.rows];
          next[i] = { ...next[i], ...patch };
          return { ...s, rows: next };
        });

      void streamCapture({ orderId: payment.orderId, destId: view.plan.prefs.destId, title: view.title }, (event) => {
        if (event.kind === "payment") {
          update((s) => ({ ...s, payment: event.status === "COMPLETED" ? `PayPal payment completed · ${usd.format(event.amountMinorUnits / 100)}` : `PayPal status: ${event.status}` }));
          if (event.status === "COMPLETED") record();
        } else if (event.kind === "tool-call" && toolKind[event.tool]) {
          setRow((r) => r.kind === toolKind[event.tool] && r.status === "queued", { status: "booking", detail: event.label });
        } else if (event.kind === "tool-result" && toolKind[event.tool]) {
          setRow((r) => r.kind === toolKind[event.tool] && r.status === "booking", { status: "booked", detail: event.summary });
        } else if (event.kind === "refund") {
          setRow((r) => r.id === event.offerId, { status: "refunded", detail: `${usd.format(event.amountMinorUnits / 100)} refunded to your PayPal` });
          update((s) => ({ ...s, refunded: s.refunded + event.amountMinorUnits / 100 }));
        } else if (event.kind === "summary") {
          update((s) => ({
            ...s,
            done: true,
            rows: s.rows.map((r) => {
              const res = event.results.find((x) => x.offerId === r.id);
              if (!res) return r.status === "refunded" ? r : { ...r, status: r.status === "booking" || r.status === "queued" ? "booked" : r.status };
              if (res.status === "booked") return { ...r, status: "booked", detail: res.bookingRef };
              return r.status === "refunded" ? r : { ...r, status: "failed", detail: res.reason };
            }),
          }));
        } else if (event.kind === "error") {
          fail(event.message);
        }
      }).catch((e: unknown) => fail(e instanceof Error ? e.message : "Payment could not be confirmed."));
      return;
    }

    // Placeholder flow when no real payment exists.
    record();
    let cancelled = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 1200));
      for (const row of rows) {
        if (cancelled) return;
        setState((s) => ({ ...s, rows: s.rows.map((r) => (r.id === row.id ? { ...r, status: "booking" } : r)) }));
        await new Promise((r) => setTimeout(r, 900));
        if (cancelled) return;
        setState((s) => ({ ...s, rows: s.rows.map((r) => (r.id === row.id ? { ...r, status: "booked" } : r)) }));
      }
      setState((s) => ({ ...s, done: true }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const split = SplitText.create(".bk-title", { type: "words", mask: "words", wordsClass: "sw" });
      gsap
        .timeline({ defaults: { ease: "expo.out" } })
        .from(".bk-check", { scale: 0, rotate: -90, duration: 1 }, 0)
        .fromTo(".bk-check path", { strokeDashoffset: 30 }, { strokeDashoffset: 0, duration: 0.8 }, 0.35)
        .from(split.words, { yPercent: 110, stagger: 0.06, duration: 1.2 }, 0.3)
        .from(".bk-sub, .bk-actions", { y: 20, opacity: 0, stagger: 0.08, duration: 1 }, 0.6)
        .from(".bk-pass", { y: 80, rotate: 4, opacity: 0, duration: 1.4 }, 0.4)
        .from(".bk-list li", { x: -20, opacity: 0, stagger: 0.06, duration: 0.8 }, 0.8);
      return () => split.revert();
    },
    { scope: root },
  );

  const done = rows.filter((r) => r.status === "booked").length;
  const settled = rows.filter((r) => r.status === "booked" || r.status === "failed" || r.status === "refunded").length;

  return (
    <div ref={root} className="bk-page">
      <AppTopbar />
      <div className="app-wrap bk-grid">
        <section className="bk-left">
          <svg className={`bk-check ${state.error ? "is-error" : ""}`} viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="23" />
            <path d={state.error ? "M16 16l16 16M32 16L16 32" : "M14 25l7 7 13-15"} strokeDasharray="30" />
          </svg>
          <h1 className="bk-title display" key={state.error ? "error" : "ok"}>
            {state.error ? (
              <>
                Payment <em>not confirmed.</em>
              </>
            ) : (
              <>
                You’re going to <em>{view.plan.dest.name}.</em>
              </>
            )}
          </h1>
          <p className="bk-sub">
            {state.error
              ? `${state.error} If you haven’t approved the order in PayPal yet, approve it there and try again. Nothing was charged.`
              : live
                ? `${state.payment}. The agent books each supplier with that one payment. If anything can’t be booked, that amount is refunded automatically.`
                : `Paid ${usd.format(view.total)} once with PayPal. The agent is booking each part of your trip now. You can close this page; we’ll email every confirmation.`}
          </p>
          {live && <p className="bk-live-tag"><span /> Live: PayPal sandbox + booking agent</p>}

          <div className="bk-progress">
            <div className="bk-progress-top">
              <span className="mono">Bookings</span>
              <span>
                {done} of {rows.length} booked{state.refunded > 0 ? ` · ${usd.format(state.refunded)} refunded` : ""}
              </span>
            </div>
            <div className="budget-bar">
              <i style={{ width: `${(settled / Math.max(rows.length, 1)) * 100}%`, transition: "width .6s var(--ease-out)" }} />
            </div>
          </div>

          <ul className="bk-list" aria-live="polite">
            {rows.map((r) => (
              <li key={r.id} className={`is-${r.status}`}>
                <span className="bk-icon">
                  <Icon name={r.icon} size={16} />
                </span>
                <span className="bk-text">
                  <b>{r.label}</b>
                  <small>{r.status === "failed" || r.status === "refunded" ? r.detail : r.supplier}</small>
                </span>
                <span className="bk-state">
                  {r.status === "queued" && "Queued"}
                  {r.status === "booking" && (
                    <>
                      <i className="bk-spin" /> Booking
                    </>
                  )}
                  {r.status === "booked" && (
                    <>
                      <Icon name="check" size={14} /> {r.detail.length > 18 ? "Booked" : r.detail || "Booked"}
                    </>
                  )}
                  {r.status === "failed" && (
                    <>
                      <Icon name="close" size={14} /> Not booked
                    </>
                  )}
                  {r.status === "refunded" && (
                    <>
                      <Icon name="refresh" size={14} /> Refunded
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <div className="bk-actions">
            {state.error && (
              <Link href="/checkout" className="btn btn-ember">
                Back to checkout
              </Link>
            )}
            {live && payment && state.done && !state.error && (
              <Link href={`/tickets?order=${encodeURIComponent(payment.orderId)}`} className="btn btn-ember">
                <Icon name="ticket" size={16} /> E-tickets &amp; QR codes
              </Link>
            )}
            <Link href="/trip" className="btn">
              View itinerary
              <span className="btn-arrow">
                <Icon name="arrow" />
              </span>
            </Link>
            <Link href="/account?tab=payments" className="btn btn-ghost">
              <Icon name="wallet" size={16} /> Receipts
            </Link>
          </div>
        </section>

        <aside className="bk-right">
          <div className="bk-pass">
            <div className="bk-pass-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={view.card} alt="" />
              <span className="mono">Trip pass</span>
            </div>
            <div className="bk-pass-body">
              <div className="bk-pass-route">
                <div>
                  <small>From</small>
                  <b>{view.flights[0].from}</b>
                  <span>{view.origin}</span>
                </div>
                <Icon name="plane" size={20} />
                <div>
                  <small>To</small>
                  <b>{view.flights[0].to}</b>
                  <span>{view.plan.dest.name}</span>
                </div>
              </div>
              <dl className="bk-pass-facts">
                <div>
                  <dt>Dates</dt>
                  <dd>{view.dates}</dd>
                </div>
                <div>
                  <dt>Travellers</dt>
                  <dd>{view.travelers}</dd>
                </div>
                <div>
                  <dt>Stay</dt>
                  <dd>{view.hotel.nights} nights</dd>
                </div>
                <div>
                  <dt>Order</dt>
                  <dd className="bk-order">{orderLabel}</dd>
                </div>
              </dl>
              <div className="bk-pass-perf" aria-hidden="true" />
              <div className="bk-pass-code" aria-hidden="true">
                {Array.from({ length: 42 }, (_, i) => (
                  <i key={i} style={{ width: `${(i * 7) % 4 + 1}px` }} />
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
