"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppTopbar } from "@/components/app/AppTopbar";
import { Icon, type IconName } from "@/components/brand/Icon";
import { usd } from "@/features/ui-mock/data";
import { planView, type PlanView } from "@/features/ui-mock/planView";
import { ordersStore, useHydrated, useTripPrefs } from "@/features/ui-mock/tripStore";
import { gsap, SplitText, useGSAP } from "@/lib/gsap";

type Status = "queued" | "booking" | "booked";

type Booking = { id: string; icon: IconName; label: string; supplier: string; ref: string };

function bookingsFor(view: PlanView): Booking[] {
  const ref = (seed: string) => seed.replace(/[^A-Z0-9]/gi, "").slice(0, 3).toUpperCase() + String(1000 + ((seed.length * 7919) % 9000));
  const [out, back] = view.flights;
  return [
    { id: "f1", icon: "plane", label: `${out.from} → ${out.to}`, supplier: out.airline, ref: ref(out.code) },
    { id: "h1", icon: "bed", label: view.hotel.name, supplier: `${view.hotel.nights} nights · ${view.hotel.area}`, ref: ref(view.hotel.name) },
    ...view.activities.map((a) => ({ id: a.id, icon: "compass" as IconName, label: a.title, supplier: a.tag, ref: ref(a.title) })),
    { id: "f2", icon: "plane", label: `${back.from} → ${back.to}`, supplier: back.airline, ref: ref(back.code + "r") },
  ];
}

export function Booked() {
  const hydrated = useHydrated();
  const prefs = useTripPrefs();
  if (!hydrated) return <div className="bk-page" aria-busy="true" />;
  return <BookedInner view={planView(prefs)} />;
}

function BookedInner({ view }: { view: PlanView }) {
  const bookings = bookingsFor(view);
  const root = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Record<string, Status>>(() => Object.fromEntries(bookings.map((b) => [b.id, "queued"])));

  useEffect(() => {
    const orders = ordersStore.get();
    const orderId = `TW-${view.plan.prefs.destId.toUpperCase().slice(0, 3)}${view.total}`;
    if (!orders.some((o) => o.id === orderId)) {
      ordersStore.set([{ id: orderId, title: view.title, destId: view.plan.prefs.destId, total: view.total, at: new Date().toISOString(), items: bookings.length }, ...orders]);
    }
    let cancelled = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 1200));
      for (const b of bookings) {
        if (cancelled) return;
        setStatus((s) => ({ ...s, [b.id]: "booking" }));
        await new Promise((r) => setTimeout(r, 900));
        if (cancelled) return;
        setStatus((s) => ({ ...s, [b.id]: "booked" }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useGSAP(
    () => {
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

  const done = bookings.filter((b) => status[b.id] === "booked").length;

  return (
    <div ref={root} className="bk-page">
      <AppTopbar />
      <div className="app-wrap bk-grid">
        <section className="bk-left">
          <svg className="bk-check" viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="23" />
            <path d="M14 25l7 7 13-15" strokeDasharray="30" />
          </svg>
          <h1 className="bk-title display">
            You’re going to <em>{view.plan.dest.name}.</em>
          </h1>
          <p className="bk-sub">
            Paid {usd.format(view.total)} once with PayPal. The agent is booking each part of your trip now. You can
            close this page; we’ll email every confirmation.
          </p>

          <div className="bk-progress">
            <div className="bk-progress-top">
              <span className="mono">Bookings</span>
              <span>
                {done} of {bookings.length}
              </span>
            </div>
            <div className="budget-bar">
              <i style={{ width: `${(done / bookings.length) * 100}%`, transition: "width .6s var(--ease-out)" }} />
            </div>
          </div>

          <ul className="bk-list" aria-live="polite">
            {bookings.map((b) => (
              <li key={b.id} className={`is-${status[b.id]}`}>
                <span className="bk-icon">
                  <Icon name={b.icon} size={16} />
                </span>
                <span className="bk-text">
                  <b>{b.label}</b>
                  <small>{b.supplier}</small>
                </span>
                <span className="bk-state">
                  {status[b.id] === "queued" && "Queued"}
                  {status[b.id] === "booking" && (
                    <>
                      <i className="bk-spin" /> Booking
                    </>
                  )}
                  {status[b.id] === "booked" && (
                    <>
                      <Icon name="check" size={14} /> {b.ref}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <div className="bk-actions">
            <Link href="/trip" className="btn">
              View itinerary
              <span className="btn-arrow">
                <Icon name="arrow" />
              </span>
            </Link>
            <button type="button" className="btn btn-ghost">
              <Icon name="calendar" size={16} /> Add to calendar
            </button>
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
                  <dd>{`TW-${view.plan.prefs.destId.toUpperCase().slice(0, 3)}${view.total}`}</dd>
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
