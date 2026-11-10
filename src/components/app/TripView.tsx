"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AppTopbar } from "@/components/app/AppTopbar";
import { Icon, type IconName } from "@/components/brand/Icon";
import { usd } from "@/features/ui-mock/data";
import { planView, type PlanView } from "@/features/ui-mock/planView";
import { useHydrated, useTripPrefs } from "@/features/ui-mock/tripStore";
import { gsap, SplitText, useGSAP } from "@/lib/gsap";
import { useLenis } from "@/components/motion/SmoothScroll";

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
  const prefs = useTripPrefs();
  if (!hydrated) return <div className="trip-page" aria-busy="true" />;
  return <TripViewInner view={planView(prefs)} />;
}

function TripViewInner({ view }: { view: PlanView }) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState("itinerary");
  const lenis = useLenis();
  const total = view.total;
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

      sections.forEach((s) => {
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
    if (lenis) lenis.scrollTo(el, { offset: -130, duration: 1.3 });
    else el.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div ref={root} className="trip-page">
      <AppTopbar back={{ href: "/plan", label: "Back to chat" }}>
        <button type="button" className="chip">
          <Icon name="heart" /> Save
        </button>
        <button type="button" className="chip">
          <Icon name="users" /> Share
        </button>
      </AppTopbar>

      <section className="trip-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="trip-hero-img" src={view.hero} alt="Lanikai Bay and the Mokulua islands from the pillbox trail" />
        <div className="trip-hero-shade" />
        <div className="trip-hero-copy app-wrap">
          <span className="tag-sample trip-tag">Sample itinerary</span>
          <h1 className="trip-title display">{view.title}</h1>
          <ul className="trip-hero-meta">
            <li>
              <Icon name="pin" size={15} /> {view.place}
            </li>
            <li>
              <Icon name="calendar" size={15} /> {view.dates}
            </li>
            <li>
              <Icon name="users" size={15} /> {view.travelers} travellers
            </li>
            <li>
              <Icon name="plane" size={15} /> From {view.origin}
            </li>
          </ul>
        </div>
      </section>

      <nav className="trip-subnav" aria-label="Sections">
        <div className="app-wrap trip-subnav-inner">
          {sections.map((s) => (
            <button key={s.id} type="button" className={active === s.id ? "is-active" : ""} onClick={() => go(s.id)}>
              {s.label}
            </button>
          ))}
          <span className="trip-subnav-total">
            {usd.format(total)} <small>total</small>
          </span>
        </div>
      </nav>

      <div className="app-wrap trip-grid">
        <div className="trip-main">
          <section id="itinerary" className="trip-section">
            <h2 className="trip-h2 display">Day by day</h2>
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
            <h2 className="trip-h2 display">Flights</h2>
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
            <h2 className="trip-h2 display">Where you’ll sleep</h2>
            <article className="trip-card trip-stay">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={view.hotel.image} alt={view.hotel.name} />
              <div>
                <span className="mono">
                  {view.hotel.area} · {view.hotel.nights} nights
                </span>
                <h3>{view.hotel.name}</h3>
                <p className="trip-stay-rating">
                  <Icon name="star" size={14} /> {view.hotel.rating} · {view.hotel.reviews} reviews
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
                  <button type="button" className="chip">
                    <Icon name="refresh" /> Swap stay
                  </button>
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
          </section>
        </div>

        <aside id="budget" className="trip-side">
          <div className="trip-summary">
            <span className="mono">Trip order</span>
            <div className="trip-summary-total">
              <b className="display">{usd.format(total)}</b>
              <span>for {view.travelers}</span>
            </div>
            <div className="budget-bar budget-bar-lg">
              <i style={{ width: `${(total / view.budget) * 100}%` }} />
              <span className="budget-cap" />
            </div>
            <p className="trip-under">
              <Icon name="shield" size={15} /> {usd.format(view.budget - total)} under your {usd.format(view.budget)} limit
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
            <Link href="/checkout" className="pay-btn">
              Pay once with{" "}
              <b>
                <span>Pay</span>
                <span>Pal</span>
              </b>
            </Link>
            <p className="trip-fine">One approval covers every booking. Nothing is stored after you pay.</p>
          </div>
          <form className="trip-ask" onSubmit={(e) => e.preventDefault()}>
            <Icon name="spark" size={16} />
            <label htmlFor="ask" className="sr-only">
              Ask for a change
            </label>
            <input id="ask" placeholder="Ask for a change…" />
            <button type="submit" aria-label="Send">
              <Icon name="send" size={16} />
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
