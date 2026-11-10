"use client";

import { useRef } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/brand/Icon";
import { usd, weaveItems, WEAVE_BUDGET, type WeaveItem } from "@/features/ui-mock/data";
import { gsap, SplitText, useGSAP } from "@/lib/gsap";

const kindIcon: Record<string, IconName> = { flight: "plane", hotel: "bed", activity: "compass" };
const total = weaveItems.reduce((s, i) => s + i.price, 0);

/**
 * The page's peak. A thread is drawn through six scattered bookings, then pulls
 * them onto a single ticket whose total lands under the budget line.
 * Card positions (percent of the stage) match the waypoints of the SVG path.
 */
const positions = [
  { left: 4, top: 12, rot: -6 },
  { left: 72, top: 8, rot: 5 },
  { left: 76, top: 56, rot: -4 },
  { left: 56, top: 80, rot: 6 },
  { left: 18, top: 78, rot: -5 },
  { left: 2, top: 50, rot: 4 },
];

const mobilePositions = [
  { left: 4, top: 7 },
  { left: 52, top: 13 },
  { left: 52, top: 67 },
  { left: 5, top: 76 },
  { left: 50, top: 85 },
  { left: 7, top: 23 },
];

const threadPath =
  "M-40 40 C 40 60, 90 110, 140 120 C 320 180, 600 10, 820 100 C 990 170, 960 300, 870 370 C 800 430, 760 520, 660 530 C 530 560, 400 580, 290 520 C 190 470, 40 470, 120 360 C 220 250, 380 230, 500 300 C 610 360, 560 440, 480 410 C 410 380, 450 300, 530 320 C 600 340, 620 300, 640 270";

function Barcode({ seed, bars = 26 }: { seed: number; bars?: number }) {
  return (
    <span className="wo-barcode" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} style={{ flexGrow: ((i * 7 + seed) % 5) + 1 }} />
      ))}
    </span>
  );
}

function WeaveObject({ item }: { item: WeaveItem }) {
  if (item.kind === "flight") {
    return (
      <div className="wo wo-pass">
        <div className="wo-pass-main">
          <div className="wo-pass-top">
            <span>{item.airline}</span>
            <span>Boarding pass</span>
          </div>
          <div className="wo-pass-route">
            <div>
              <b>{item.from}</b>
              <small>{item.fromCity}</small>
            </div>
            <Icon name="plane" size={15} />
            <div>
              <b>{item.to}</b>
              <small>{item.toCity}</small>
            </div>
          </div>
          <dl className="wo-pass-facts">
            <div>
              <dt>Flight</dt>
              <dd>{item.flight}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{item.date}</dd>
            </div>
            <div>
              <dt>Dep</dt>
              <dd>{item.time}</dd>
            </div>
            <div>
              <dt>Seat</dt>
              <dd>{item.seat}</dd>
            </div>
          </dl>
        </div>
        <div className="wo-pass-stub">
          <Barcode seed={item.flight.length} />
          <span className="wo-price">{usd.format(item.price)}</span>
        </div>
      </div>
    );
  }
  if (item.kind === "hotel") {
    return (
      <div className="wo wo-key">
        <span className="wo-key-hole" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.image} alt="" loading="lazy" />
        <div className="wo-key-body">
          <span className="wo-key-label">Room key · Guest folio</span>
          <b>{item.title}</b>
          <span>{item.nights}</span>
          <div className="wo-key-foot">
            <span>Conf. {item.ref}</span>
            <span className="wo-price">{usd.format(item.price)}</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`wo wo-stub tone-${item.tone}`}>
      <div className="wo-stub-main">
        <span className="wo-stub-admit">Admit two</span>
        <b>{item.title}</b>
        <span>{item.date}</span>
      </div>
      <div className="wo-stub-side">
        <span className="wo-stub-serial">{item.serial}</span>
        <span className="wo-price">{usd.format(item.price)}</span>
      </div>
    </div>
  );
}

export function Weave() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.utils.toArray<HTMLElement>(".weave-card").forEach((card) => gsap.set(card, { rotate: Number(card.dataset.rot) }));
      const mm = gsap.matchMedia();
      mm.add(
        {
          motion: "(prefers-reduced-motion: no-preference)",
          small: "(max-width: 760px)",
        },
        (ctx) => {
          const { motion, small } = ctx.conditions as { motion: boolean; small: boolean };
          if (small) {
            gsap.utils.toArray<HTMLElement>(".weave-card").forEach((card, i) =>
              gsap.set(card, { left: `${mobilePositions[i].left}%`, top: `${mobilePositions[i].top}%` }),
            );
          }
          if (!motion) return;
          const path = root.current?.querySelector<SVGPathElement>(".weave-thread");
          const ghost = root.current?.querySelector<SVGPathElement>(".weave-thread-ghost");
          if (!path || !ghost) return;
          const length = path.getTotalLength();
          gsap.set([path], { strokeDasharray: length, strokeDashoffset: length });
          const cards = gsap.utils.toArray<HTMLElement>(".weave-card");
          const rows = gsap.utils.toArray<HTMLElement>(".ticket-row");
          const totalEl = root.current?.querySelector<HTMLElement>(".ticket-total-value");
          const counter = { v: 0 };
          const split = SplitText.create(".weave-title", { type: "words", mask: "words", wordsClass: "sw" });

          gsap.set(".weave-ticket", { opacity: 0, y: 80, rotate: -3, scale: 0.92 });
          gsap.set(rows, { opacity: 0, x: -14 });
          gsap.set(".ticket-pay", { opacity: 0, y: 16 });
          gsap.set(".ticket-bar i", { scaleX: 0 });

          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: root.current,
              start: "top top",
              end: small ? "+=220%" : "+=280%",
              scrub: 0.8,
              pin: ".weave-stage",
            },
          });

          tl.from(split.words, { yPercent: 110, stagger: 0.04, duration: 0.3, ease: "power3.out" }, 0)
            .from(cards, { opacity: 0, scale: 0.8, y: 40, stagger: 0.05, duration: 0.3, ease: "power3.out" }, 0.05)
            .to(path, { strokeDashoffset: 0, duration: 1.6 }, 0.3);

          cards.forEach((card, i) => {
            tl.to(card, { "--lit": 1, duration: 0.12 }, 0.3 + (1.6 * (i + 1)) / 8);
          });

          tl.to(".weave-title-wrap", { opacity: 0, y: -40, scale: 0.96, duration: 0.3, ease: "power2.in" }, 1.85);

          cards.forEach((card, i) => {
            tl.to(
              card,
              {
                left: "50%",
                top: "50%",
                xPercent: -50,
                yPercent: -50,
                rotate: 0,
                scale: 0.6,
                opacity: 0,
                duration: 0.55,
                ease: "power3.inOut",
              },
              2.0 + i * 0.05,
            );
          });
          tl.to(path, { opacity: 0, duration: 0.4 }, 2.1)
            .to(ghost, { opacity: 0, duration: 0.4 }, 2.1)
            .to(".weave-ticket", { opacity: 1, y: 0, rotate: 0, scale: 1, duration: 0.6, ease: "expo.out" }, 2.35)
            .to(rows, { opacity: 1, x: 0, stagger: 0.07, duration: 0.25, ease: "power2.out" }, 2.5)
            .to(
              counter,
              {
                v: total,
                duration: 0.7,
                ease: "power2.out",
                onUpdate: () => {
                  if (totalEl) totalEl.textContent = usd.format(Math.round(counter.v));
                },
              },
              2.5,
            )
            .to(".ticket-bar i", { scaleX: total / WEAVE_BUDGET, duration: 0.7, ease: "power2.out" }, 2.5)
            .to(".ticket-pay", { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, 3.05)
            .to({}, { duration: 0.35 });

          return () => split.revert();
        },
      );
    },
    { scope: root },
  );

  return (
    <section ref={root} id="weave" className="weave" data-nav="dark" aria-labelledby="weave-title">
      <div className="weave-stage">
        <svg className="weave-svg" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
          <path className="weave-thread-ghost" d={threadPath} />
          <path className="weave-thread" d={threadPath} />
        </svg>

        <div className="weave-title-wrap">
          <p className="mono">The part nobody likes</p>
          <h2 id="weave-title" className="weave-title display">
            Six bookings. <em>One</em> payment.
          </h2>
          <p className="weave-sub">Flights, a stay and three days out, tied into a single total that never crosses your line.</p>
        </div>

        <ul className="weave-cards" aria-label="Bookings in this sample trip">
          {weaveItems.map((item, i) => (
            <li
              key={item.id}
              className={`weave-card kind-${item.kind}`}
              data-rot={positions[i].rot}
              style={
                {
                  left: `${positions[i].left}%`,
                  top: `${positions[i].top}%`,
                } as React.CSSProperties
              }
            >
              <WeaveObject item={item} />
            </li>
          ))}
        </ul>

        <div className="weave-ticket" aria-label="Your single payment">
          <div className="ticket-head">
            <span className="ticket-knot" aria-hidden="true" />
            <div>
              <p className="mono">Trip order</p>
              <h3>Oahu · 5 nights · 2 travellers</h3>
            </div>
          </div>
          <ul className="ticket-rows">
            {weaveItems.map((item) => (
              <li key={item.id} className="ticket-row">
                <Icon name={kindIcon[item.kind]} size={14} />
                <span>{item.title}</span>
                <b>{usd.format(item.price)}</b>
              </li>
            ))}
          </ul>
          <div className="ticket-perf" aria-hidden="true" />
          <div className="ticket-total">
            <span className="mono">Total</span>
            <span className="ticket-total-value">{usd.format(total)}</span>
          </div>
          <div className="ticket-bar" aria-label={`${usd.format(total)} of ${usd.format(WEAVE_BUDGET)} budget`}>
            <i />
            <span className="ticket-bar-cap mono">Budget {usd.format(WEAVE_BUDGET)}</span>
          </div>
          <Link href="/checkout" className="pay-btn ticket-pay">
            Pay once with{" "}
            <b>
              <span>Pay</span>
              <span>Pal</span>
            </b>
          </Link>
        </div>
      </div>
    </section>
  );
}
