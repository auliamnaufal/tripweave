"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AppTopbar } from "@/components/app/AppTopbar";
import { Icon, type IconName } from "@/components/brand/Icon";
import { usd } from "@/features/ui-mock/data";
import { isLive, useTripView, type AnyTripView } from "@/features/live/useTripView";
import { savedStore, tripPaidFor, useHydrated, useOrders, useSaved } from "@/features/ui-mock/tripStore";
import { gsap, prefersReducedMotion, SplitText, useGSAP } from "@/lib/gsap";
import { useLenis } from "@/components/motion/SmoothScroll";
import { DealPanel } from "@/components/app/DealPanel";
import { GearPanel } from "@/components/app/GearPanel";
import { ActivityOptions, EditStatus, LiveOptions } from "@/components/app/LiveOptions";
import { EditTripDialog } from "@/components/app/EditTrip";
import { useLivePayment, useLivePlan } from "@/features/live/liveStore";
import { usePaidBookings } from "@/features/live/usePaidBookings";
import { syncEdits } from "@/features/live/planEditor";
import { itineraryTimeline, wallClock, type TimelineKind } from "@/features/timeline/itineraryTimeline";
import { fetchRebookSuggestions } from "@/features/live/client";
import type { RebookResponse } from "@/features/rebook/types";
import "./edit-trip.css";
import "./itinerary-timeline.css";

// Bryntum touches window on import, so the timeline only ever loads in the browser.
const ItineraryTimeline = dynamic(() => import("@/components/app/ItineraryTimeline"), {
  ssr: false,
  loading: () => <div className="trip-timeline-skeleton" aria-busy="true" />,
});

const kindIcon: Record<string, IconName> = {
  flight: "plane",
  hotel: "bed",
  activity: "compass",
  food: "leaf",
  free: "sun",
};

const sections = [
  { id: "itinerary", label: "Itinerary" },
  { id: "flights", label: "Flights" },
  { id: "stay", label: "Stay" },
  { id: "budget", label: "Budget" },
];

export function TripView() {
  const hydrated = useHydrated();
  const view = useTripView();
  if (!hydrated) return <div className="trip-page" aria-busy="true" />;
  return <TripViewInner view={view} />;
}

function TripViewInner({ view }: { view: AnyTripView }) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState("itinerary");
  const [shareNote, setShareNote] = useState("");
  const lenis = useLenis();
  const saved = useSaved();
  const destId = view.plan.prefs.destId;
  const isSaved = saved.includes(destId);
  const people = `${view.travelers} ${view.travelers === 1 ? "traveller" : "travellers"}`;

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: view.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareNote("Link copied");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setShareNote("Copy the link from the address bar to share");
    }
    window.setTimeout(() => setShareNote(""), 2400);
  }
  const total = view.total;
  // Same (destId, total) pairing Booked.tsx records the order under — this plan
  // was already paid for if an order for it is already in the store.
  const orders = useOrders();
  const live = useLivePlan();
  // The PayPal order Checkout made for exactly this plan (same offer snapshot), if any.
  const payment = useLivePayment();
  const paidOrderId = live && payment && payment.planRetrievedAt === (live.plan.offers[0]?.retrievedAt ?? "") ? payment.orderId : undefined;
  // Booked, failed or refunded per offer, from what the server stored at capture.
  const paidBookings = usePaidBookings(paidOrderId);
  const paid = Boolean(paidBookings) || tripPaidFor(orders, view.plan.prefs.destId, total);
  // Until it's paid, the plan stays editable here: options swap in place, no chat round trip.
  const editable = isLive(view) && !paid && Boolean(live?.quoteId);
  const [openEdit, setOpenEdit] = useState<"flight" | "hotel" | "activity" | null>(null);
  const [editingTrip, setEditingTrip] = useState(false);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const toggleEdit = (kind: "flight" | "hotel" | "activity") => setOpenEdit((open) => (open === kind ? null : kind));
  const syncing = Boolean(live?.syncing);
  // The rebooking agent's replacements for activities that were refunded, for this paid order only.
  const [rebook, setRebook] = useState<{ orderId: string; phase: "loading" | "done" | "error"; data?: RebookResponse; error?: string } | null>(null);
  const rebookHere = rebook && rebook.orderId === paidOrderId ? rebook : null;
  const suggestions = rebookHere?.data?.suggestions;
  const freedActivities = paidBookings?.items.filter((item) => item.kind === "activity" && (item.refunded || item.status === "failed")).length ?? 0;
  async function askRebookAgent() {
    if (!paidOrderId) return;
    const orderId = paidOrderId;
    setRebook({ orderId, phase: "loading" });
    try {
      setRebook({ orderId, phase: "done", data: await fetchRebookSuggestions(orderId) });
    } catch (e) {
      setRebook({ orderId, phase: "error", error: e instanceof Error ? e.message : "The rebooking agent couldn’t answer right now." });
    }
  }
  const timeline = useMemo(
    () => (live ? itineraryTimeline(live.plan, live.brief.travelWindow, paidBookings?.items, suggestions) : null),
    [live, paidBookings, suggestions],
  );
  const refundedMinorUnits = timeline?.bars.reduce((sum, b) => sum + (b.outcome?.state === "refunded" ? b.costMinorUnits : 0), 0) ?? 0;
  const canSwap = (kind: TimelineKind) =>
    kind === "activity" ? Boolean(live?.activityOptions?.length) : Boolean(live?.alternatives?.some((slot) => slot.kind === kind));
  // A bar on the timeline opens the same swap panel as that section's button.
  const pickFromTimeline = useCallback(
    (kind: TimelineKind) => {
      if (!canSwap(kind)) return;
      setOpenEdit(kind);
      const target = document.getElementById(kind === "flight" ? "trip-edit-flight-anchor" : kind === "hotel" ? "stay" : "trip-edit-activity-anchor");
      window.requestAnimationFrame(() => {
        if (!target) return;
        if (lenis && !prefersReducedMotion()) lenis.scrollTo(target, { offset: -130, duration: 1.1 });
        else target.scrollIntoView();
      });
    },
    // canSwap reads live, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, lenis],
  );
  // A reload in the middle of a save picks the save back up.
  useEffect(() => {
    if (syncing) void syncEdits();
  }, [syncing]);
  const over = total > view.budget;
  const flightsTotal = view.flights.reduce((s, f) => s + f.price, 0);
  const actTotal = view.activities.reduce((s, a) => s + a.price, 0);
  const breakdown = [
    { label: "Flights", value: flightsTotal, color: "var(--forest-700)" },
    { label: "Stay", value: view.hotel.price, color: "var(--sand)" },
    { label: "Activities", value: actTotal, color: "var(--ember)" },
  ];

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const split = SplitText.create(".trip-title", { type: "words", mask: "words", wordsClass: "sw" });
        gsap
          .timeline({ defaults: { ease: "expo.out" } })
          .from(".trip-hero-img", { scale: 1.25, duration: 2.2 }, 0)
          .from(split.words, { yPercent: 110, stagger: 0.06, duration: 1.3 }, 0.2)
          .from(".trip-hero-meta > *", { y: 20, opacity: 0, stagger: 0.06, duration: 1 }, 0.5);

        gsap.to(".trip-hero-img", {
          yPercent: 18,
          ease: "none",
          scrollTrigger: { trigger: ".trip-hero", start: "top top", end: "bottom top", scrub: true },
        });

        gsap.fromTo(
          ".trip-thread-fill",
          { scaleY: 0 },
          {
            scaleY: 1,
            ease: "none",
            scrollTrigger: { trigger: ".trip-days", start: "top 60%", end: "bottom 60%", scrub: true },
          },
        );
        gsap.utils.toArray<HTMLElement>(".trip-day").forEach((day) => {
          gsap.from(day.querySelectorAll(".trip-day-head, .trip-item"), {
            y: 30,
            opacity: 0,
            stagger: 0.06,
            duration: 1,
            ease: "expo.out",
            scrollTrigger: { trigger: day, start: "top 80%" },
          });
          gsap.to(day.querySelector(".trip-day-knot"), {
            backgroundColor: "#c9512a",
            scale: 1,
            scrollTrigger: { trigger: day, start: "top 60%", toggleActions: "play none none reverse" },
          });
        });
        gsap.from(".trip-card", {
          y: 40,
          opacity: 0,
          stagger: 0.08,
          duration: 1.1,
          ease: "expo.out",
          scrollTrigger: { trigger: "#flights", start: "top 80%" },
        });
        return () => split.revert();
      });

      // The budget card is sticky beside the days on wide screens, so it only drives the active tab once the grid stacks.
      const stacked = window.matchMedia("(max-width: 1020px)").matches;
      sections.filter((s) => stacked || s.id !== "budget").forEach((s) => {
        gsap.timeline({
          scrollTrigger: {
            trigger: `#${s.id}`,
            start: "top 50%",
            end: "bottom 50%",
            onToggle: (self) => self.isActive && setActive(s.id),
          },
        });
      });
    },
    { scope: root },
  );

  function go(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    setActive(id);
    if (prefersReducedMotion()) {
      el.scrollIntoView();
      return;
    }
    if (lenis) lenis.scrollTo(el, { offset: -130, duration: 1.3 });
    else el.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div ref={root} className="trip-page">
      <AppTopbar back={{ href: "/plan", label: "Back to chat" }}>
        <span className="sr-only" role="status">
          {shareNote}
        </span>
        <button
          type="button"
          className={`chip ${isSaved ? "is-on" : ""}`}
          aria-pressed={isSaved}
          onClick={() => savedStore.set(isSaved ? saved.filter((x) => x !== destId) : [...saved, destId])}
        >
          <Icon name="heart" /> <span className="chip-label">{isSaved ? "Saved" : "Save"}</span>
        </button>
        <button type="button" className="chip" onClick={() => void share()}>
          <Icon name="users" /> <span className="chip-label">{shareNote || "Share"}</span>
        </button>
      </AppTopbar>

      <section className="trip-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="trip-hero-img" src={view.hero} alt="" />
        <div className="trip-hero-shade" />
        <div className="trip-hero-copy app-wrap">
          <span className="tag-sample trip-tag">{isLive(view) ? "Planned by the agent · best deal across partner platforms" : "Sample itinerary"}</span>
          <h1 className="trip-title display">{view.title}</h1>
          <ul className="trip-hero-meta">
            <li>
              <Icon name="pin" size={15} /> {view.place}
            </li>
            <li>
              <Icon name="calendar" size={15} /> {view.dates}
            </li>
            <li>
              <Icon name="users" size={15} /> {people}
            </li>
            <li>
              <Icon name="plane" size={15} /> From {view.origin}
            </li>
            {editable && live && (
              <li>
                <button type="button" className="trip-hero-edit" onClick={() => setEditingTrip(true)}>
                  <Icon name="calendar" size={14} /> Edit dates, travellers or budget
                </button>
              </li>
            )}
          </ul>
        </div>
      </section>

      <nav className="trip-subnav" aria-label="Sections">
        <div className="app-wrap trip-subnav-inner">
          {sections.map((s) => (
            <button key={s.id} type="button" className={active === s.id ? "is-active" : ""} aria-current={active === s.id ? "location" : undefined} onClick={() => go(s.id)}>
              {s.label}
            </button>
          ))}
          <span className="trip-subnav-total">
            {usd.format(total)} <small>total</small>
          </span>
        </div>
      </nav>

      {isLive(view) && timeline && timeline.bars.length > 0 && (
        <section className="app-wrap trip-timeline" aria-label="Trip timeline">
          <div className="trip-timeline-head">
            <h3 className="mono">The whole trip at a glance</h3>
            <p>
              {paidBookings
                ? refundedMinorUnits > 0
                  ? `Paid once with PayPal. ${usd.format(refundedMinorUnits / 100)} came back to your PayPal for what couldn’t be booked.`
                  : "Paid once with PayPal: every booking is confirmed."
                : paid
                ? "Paid with PayPal: every booking is locked in."
                : editable
                  ? "Hover or tap a booking for details; click it to swap it before you pay."
                  : "Hover or tap a booking for details."}
            </p>
          </div>
          <ItineraryTimeline model={timeline} paid={paid} onPick={editable ? pickFromTimeline : undefined}
            pickable={(["flight", "hotel", "activity"] as const).filter(canSwap)}
          />
          <ul className="trip-timeline-legend">
            <li><i style={{ background: "var(--forest-700)" }} /> Flight</li>
            <li><i style={{ background: "var(--sand)" }} /> Stay</li>
            <li><i style={{ background: "var(--ember)" }} /> Things to do</li>
            {timeline.bars.some((b) => b.flags.length > 0) && (
              <li><i style={{ background: "#b42318" }} /> Clashes or falls outside your dates</li>
            )}
            {refundedMinorUnits > 0 && (
              <li><i className="trip-timeline-refunded-swatch" /> Refunded to your PayPal</li>
            )}
            {suggestions && suggestions.length > 0 && (
              <li><i className="trip-timeline-suggested-swatch" /> Agent’s suggested replacement</li>
            )}
          </ul>
          {freedActivities > 0 && (
            <div className="trip-rebook" aria-live="polite">
              <div className="trip-rebook-head">
                <p>
                  <b>{freedActivities === 1 ? "One activity" : `${freedActivities} activities`} couldn’t be booked.</b>{" "}
                  {rebookHere?.phase === "done"
                    ? rebookHere.data?.note
                    : "The rebooking agent can look through the same search for something that fits the empty slot, within what you were refunded."}
                </p>
                {rebookHere?.phase !== "done" && (
                  <button type="button" className="chip" onClick={() => void askRebookAgent()} disabled={rebookHere?.phase === "loading"}>
                    <Icon name="spark" /> <span className="chip-label">{rebookHere?.phase === "loading" ? "Finding replacements…" : "Find a replacement"}</span>
                  </button>
                )}
              </div>
              {rebookHere?.phase === "error" && <p className="trip-rebook-error">{rebookHere.error}</p>}
              {suggestions && suggestions.length > 0 && (
                <>
                  <ul className="trip-rebook-list">
                    {suggestions.map((s) => {
                      const start = wallClock(s.offer.startsAt);
                      const end = wallClock(s.offer.endsAt);
                      const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                      return (
                        <li key={s.offer.id}>
                          <span className="trip-rebook-for">Instead of {s.forTitle}</span>
                          <b>{s.offer.title}</b>
                          <small>
                            {start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {time(start)}–{time(end)} ·{" "}
                            {usd.format(s.offer.costMinorUnits / 100)} of your {usd.format(s.refundMinorUnits / 100)} refund ·{" "}
                            {s.offer.synthetic ? "Sample listing" : `via ${s.offer.platform}`}
                          </small>
                          <span>{s.reason}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="trip-rebook-foot">Suggestions only: nothing is booked or charged, and your refund is already back on PayPal.</p>
                </>
              )}
            </div>
          )}
        </section>
      )}

      <div className="app-wrap trip-grid">
        <div className="trip-main">
          <section id="itinerary" className="trip-section">
            <h2 className="trip-h2 display">Day by day</h2>
            {isLive(view) && view.note && (
              <p className="trip-note">
                <Icon name="spark" size={16} /> {view.note}
              </p>
            )}
            {isLive(view) && view.deal && <DealPanel deal={view.deal} />}
            <div className="trip-days">
              <span className="trip-thread" aria-hidden="true">
                <i className="trip-thread-fill" />
              </span>
              {view.days.map((d) => (
                <article key={d.day} className="trip-day">
                  <span className="trip-day-knot" aria-hidden="true" />
                  <header className="trip-day-head">
                    <span className="mono">
                      Day {d.day} · {d.date}
                    </span>
                    <h3>{d.title}</h3>
                  </header>
                  <ul>
                    {d.items.map((it) => (
                      <li key={it.time + it.title} className={`trip-item kind-${it.kind}`}>
                        <time>{it.time}</time>
                        <span className="trip-item-icon">
                          <Icon name={kindIcon[it.kind]} size={15} />
                        </span>
                        <span className="trip-item-text">
                          <b>{it.title}</b>
                          <small>{it.note}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <section id="flights" className="trip-section">
            <div className="trip-h2-row" id="trip-edit-flight-anchor">
              <h2 className="trip-h2 display">Flights</h2>
              {editable && live?.alternatives?.some((slot) => slot.kind === "flight") && (
                <button type="button" className="trip-edit-toggle" aria-expanded={openEdit === "flight"} aria-controls="trip-edit-flight" onClick={() => toggleEdit("flight")}>
                  <Icon name="refresh" size={14} /> {openEdit === "flight" ? "Done" : "Change flights"}
                </button>
              )}
            </div>
            {editable && openEdit === "flight" && (
              <div id="trip-edit-flight" className="trip-edit-panel">
                <LiveOptions kind="flight" onChange={setEditMessage} />
              </div>
            )}
            <div className="trip-flights">
              {view.flights.map((f) => (
                <article key={f.id} className="trip-card trip-flight">
                  <div className="trip-flight-top">
                    <span className="mono">{f.date}</span>
                    <span className="mini-pill">{f.stops}</span>
                  </div>
                  <div className="trip-flight-route">
                    <div>
                      <b>{f.depart}</b>
                      <span>{f.from}</span>
                    </div>
                    <i>
                      <span>{f.duration}</span>
                      <Icon name="plane" size={16} />
                    </i>
                    <div>
                      <b>{f.arrive}</b>
                      <span>{f.to}</span>
                    </div>
                  </div>
                  <div className="trip-flight-foot">
                    <span>
                      {f.airline} · {f.code}
                    </span>
                    <b>{usd.format(f.price)}</b>
                  </div>
                  <p className="trip-flight-note">
                    <Icon name="check" size={14} /> Free cancellation within 24 hours of booking
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section id="stay" className="trip-section">
            <div className="trip-h2-row">
              <h2 className="trip-h2 display">Where you’ll sleep</h2>
              {editable && live?.alternatives?.some((slot) => slot.kind === "hotel") && (
                <button type="button" className="trip-edit-toggle" aria-expanded={openEdit === "hotel"} aria-controls="trip-edit-hotel" onClick={() => toggleEdit("hotel")}>
                  <Icon name="refresh" size={14} /> {openEdit === "hotel" ? "Done" : "Change stay"}
                </button>
              )}
            </div>
            {editable && openEdit === "hotel" && (
              <div id="trip-edit-hotel" className="trip-edit-panel">
                <LiveOptions kind="hotel" onChange={setEditMessage} />
              </div>
            )}
            <article className="trip-card trip-stay">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={view.hotel.image} alt={view.hotel.name} />
              <div>
                <span className="mono">
                  {view.hotel.area} · {view.hotel.nights} nights
                </span>
                <h3>{view.hotel.name}</h3>
                <p className="trip-stay-rating">
                  <Icon name="star" size={14} /> {view.hotel.rating}{view.hotel.reviews > 0 ? ` · ${view.hotel.reviews} reviews` : ""}
                </p>
                <ul>
                  {view.hotel.perks.map((p) => (
                    <li key={p}>
                      <Icon name="check" size={14} /> {p}
                    </li>
                  ))}
                </ul>
                <div className="trip-stay-foot">
                  <b>{usd.format(view.hotel.price)}</b>
                </div>
              </div>
            </article>
            <div className="trip-acts">
              {view.activities.map((a) => (
                <article key={a.id} className="trip-card trip-act">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.image} alt="" />
                  <div>
                    <span className="mono">{a.tag}</span>
                    <b>{a.title}</b>
                    <span className="trip-act-foot">
                      <span>
                        <Icon name="star" size={12} /> {a.rating}
                      </span>
                      {usd.format(a.price)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
            {editable && Boolean(live?.activityOptions?.length) && (
              <>
                <div className="trip-h2-row" id="trip-edit-activity-anchor" style={{ marginTop: 18 }}>
                  <button type="button" className="trip-edit-toggle" style={{ marginLeft: 0 }} aria-expanded={openEdit === "activity"} aria-controls="trip-edit-activity" onClick={() => toggleEdit("activity")}>
                    <Icon name="compass" size={14} /> {openEdit === "activity" ? "Done" : "Add or remove things to do"}
                  </button>
                </div>
                {openEdit === "activity" && (
                  <div id="trip-edit-activity" className="trip-edit-panel">
                    <ActivityOptions onChange={setEditMessage} />
                  </div>
                )}
              </>
            )}
          </section>
          {isLive(view) && view.quoteId && (
            <section id="gear" className="trip-section">
              <GearPanel quoteId={view.quoteId} />
            </section>
          )}
        </div>

        <aside id="budget" className="trip-side">
          <div className="trip-summary">
            <span className="mono">Trip order</span>
            <div className="trip-summary-total">
              <b className="display">{usd.format(total)}</b>
              <span>for {view.travelers}</span>
            </div>
            <div className="budget-bar budget-bar-lg">
              <i style={{ width: `${Math.min(100, (total / view.budget) * 100)}%` }} />
              <span className="budget-cap" />
            </div>
            <p className={`trip-under ${over ? "is-over" : ""}`}>
              <Icon name={over ? "close" : "shield"} size={15} />{" "}
              {over ? `${usd.format(total - view.budget)} over your ${usd.format(view.budget)} limit` : `${usd.format(view.budget - total)} under your ${usd.format(view.budget)} limit`}
            </p>
            <div className="trip-stack" aria-hidden="true">
              {breakdown.map((b) => (
                <i key={b.label} style={{ flex: b.value, background: b.color }} />
              ))}
            </div>
            <ul className="trip-breakdown">
              {breakdown.map((b) => (
                <li key={b.label}>
                  <span className="trip-dot" style={{ background: b.color }} />
                  {b.label}
                  <b>{usd.format(b.value)}</b>
                </li>
              ))}
            </ul>
            {paid ? (
              <Link href="/booked" className="btn" style={{ width: "100%" }}>
                <Icon name="check" size={16} /> Paid · view booking
              </Link>
            ) : syncing ? (
              <button type="button" className="pay-btn" disabled aria-describedby="trip-edit-status">
                Saving your changes…
              </button>
            ) : (
              <Link href="/checkout" className="pay-btn">
                Pay once with{" "}
                <b>
                  <span>Pay</span>
                  <span>Pal</span>
                </b>
              </Link>
            )}
            <div id="trip-edit-status">
              <EditStatus message={editMessage} />
            </div>
            <p className="trip-fine">
              {paid ? "This trip is paid for. Every booking is already underway." : "One approval covers every booking. Nothing is stored after you pay."}
            </p>
          </div>
        </aside>
      </div>
      {editingTrip && live && <EditTripDialog live={live} onClose={() => setEditingTrip(false)} />}
    </div>
  );
}
