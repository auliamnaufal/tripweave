"use client";

import { useRef } from "react";
import Link from "next/link";
import { Icon } from "@/components/brand/Icon";
import { trip, tripTotal, usd } from "@/features/ui-mock/data";
import { gsap, useGSAP } from "@/lib/gsap";

function ChatCard() {
  return (
    <div className="mini mini-chat">
      <p className="mini-bubble mini-bubble-user">Oahu for two in March. Quiet, outdoorsy, under $3k.</p>
      <p className="mini-bubble">
        North Shore suits that. I found 14 flight options and kept 2 nonstops that land before noon.
      </p>
      <div className="mini-tools">
        <span>
          <Icon name="check" size={12} /> search_flights
        </span>
        <span>
          <Icon name="check" size={12} /> search_hotels
        </span>
        <span className="is-live">build_itinerary</span>
      </div>
    </div>
  );
}

function FlightCard() {
  const f = trip.flights[0];
  return (
    <div className="mini mini-flight">
      <div className="mini-row">
        <span className="mono">{f.date}</span>
        <span className="mini-pill">{f.stops}</span>
      </div>
      <div className="mini-route">
        <b>{f.from}</b>
        <i>
          <Icon name="plane" size={14} />
        </i>
        <b>{f.to}</b>
      </div>
      <div className="mini-row mini-soft">
        <span>
          {f.depart} – {f.arrive}
        </span>
        <span>{f.duration}</span>
      </div>
      <div className="mini-row">
        <span className="mini-soft">{f.airline}</span>
        <b>{usd.format(f.price)}</b>
      </div>
    </div>
  );
}

function PlaceCard({ image, title, sub }: { image: string; title: string; sub: string }) {
  return (
    <div className="mini mini-place">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="" loading="lazy" />
      <div>
        <b>{title}</b>
        <span>
          <Icon name="pin" size={12} /> {sub}
        </span>
      </div>
      <span className="mini-heart">
        <Icon name="heart" size={14} />
      </span>
    </div>
  );
}

function BudgetCard() {
  const total = tripTotal();
  return (
    <div className="mini mini-budget">
      <span className="mono">Budget check</span>
      <b className="mini-big">{usd.format(total)}</b>
      <div className="mini-bar">
        <i style={{ width: `${(total / trip.budget) * 100}%` }} />
      </div>
      <div className="mini-row mini-soft">
        <span>Under by {usd.format(trip.budget - total)}</span>
        <span>{usd.format(trip.budget)}</span>
      </div>
    </div>
  );
}

function DayCard() {
  const d = trip.days[1];
  return (
    <div className="mini mini-day">
      <span className="mono">
        Day {d.day} · {d.date}
      </span>
      <b>{d.title}</b>
      <ul>
        {d.items.map((it) => (
          <li key={it.time}>
            <span>{it.time}</span>
            {it.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BookingCard() {
  return (
    <div className="mini mini-booking">
      <span className="mono">Booking</span>
      <ul>
        <li className="is-done">
          <Icon name="check" size={12} /> Flight SFO → HNL
        </li>
        <li className="is-done">
          <Icon name="check" size={12} /> Haleʻiwa cottage
        </li>
        <li className="is-live">
          <i /> Hanauma Bay snorkel
        </li>
      </ul>
    </div>
  );
}

function MapCard() {
  return (
    <div className="mini mini-map">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/app-map.webp" alt="" loading="lazy" />
      <span className="mini-map-pin" style={{ left: "38%", top: "40%" }}>
        Haleʻiwa
      </span>
      <span className="mini-map-pin" style={{ left: "60%", top: "66%" }}>
        Hanauma
      </span>
    </div>
  );
}

function PayCard() {
  return (
    <div className="mini mini-pay">
      <span className="mono">Trip order</span>
      <b className="mini-big">{usd.format(tripTotal())}</b>
      <span className="pay-btn pay-btn-mini">
        Pay with{" "}
        <b>
          <span>Pay</span>
          <span>Pal</span>
        </b>
      </span>
    </div>
  );
}

const columns = [
  [<ChatCard key="c" />, <PlaceCard key="p" image="/images/d-oahu.webp" title="Koʻolau ridges" sub="Kāneʻohe, Oahu" />, <BudgetCard key="b" />, <MapCard key="m" />],
  [<FlightCard key="f" />, <DayCard key="d" />, <PlaceCard key="p2" image="/images/w-oahu.webp" title="Lanikai Pillbox" sub="Kailua, Oahu" />, <PayCard key="pay" />],
  [<MapCard key="m2" />, <BookingCard key="bk" />, <ChatCard key="c2" />, <FlightCard key="f2" />],
];

export function Workspace() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const opts = { ease: "none", scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", scrub: 0.6 } };
        gsap.fromTo(".ws-col-0", { yPercent: 6 }, { yPercent: -22, ...opts });
        gsap.fromTo(".ws-col-1", { yPercent: -18 }, { yPercent: 8, ...opts });
        gsap.fromTo(".ws-col-2", { yPercent: 10 }, { yPercent: -26, ...opts });
        gsap.fromTo(".ws-plane", { rotateX: 38, rotateZ: -14, scale: 0.9 }, { rotateX: 22, rotateZ: -8, scale: 1, ...opts });
        gsap.from(".ws-copy > *", {
          y: 40,
          opacity: 0,
          stagger: 0.1,
          duration: 1.2,
          ease: "expo.out",
          scrollTrigger: { trigger: root.current, start: "top 70%" },
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="workspace" data-nav="light" aria-labelledby="ws-title">
      <div className="wrap ws-inner">
        <div className="ws-copy">
          <p className="mono">The workspace</p>
          <h2 id="ws-title" className="display">
            A calm place for a <em>complicated</em> thing.
          </h2>
          <p>
            Chat on the left, the plan on the right, the budget always in view. You can see every search the agent
            runs and every number it adds up.
          </p>
          <Link href="/plan" className="btn">
            Open the planner
            <span className="btn-arrow">
              <Icon name="arrow" />
            </span>
          </Link>
        </div>
        <div className="ws-viewport" aria-hidden="true">
          <div className="ws-plane">
            {columns.map((col, i) => (
              <div key={i} className={`ws-col ws-col-${i}`}>
                {col}
                {col}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
