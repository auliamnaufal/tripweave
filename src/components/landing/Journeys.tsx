"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/brand/Icon";
import { journeys, usd, type Journey } from "@/features/ui-mock/data";
import { Flip, gsap, SplitText, useGSAP } from "@/lib/gsap";
import { useLenis } from "@/components/motion/SmoothScroll";

export function Journeys() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState<Journey | null>(null);
  const flipState = useRef<Flip.FlipState | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const lenis = useLenis();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const split = SplitText.create(".journeys-title", { type: "chars", mask: "chars", charsClass: "sc" });
        gsap.from(split.chars, {
          yPercent: 110,
          stagger: 0.025,
          duration: 1.2,
          ease: "expo.out",
          scrollTrigger: { trigger: ".journeys-title", start: "top 85%" },
        });
        gsap.from(".journey-card", {
          yPercent: 30,
          opacity: 0,
          clipPath: "inset(30% 0% 0% 0% round 14px)",
          stagger: { each: 0.08, from: "center" },
          duration: 1.4,
          ease: "expo.out",
          scrollTrigger: { trigger: ".journeys-row", start: "top 85%" },
        });
        gsap.fromTo(".journeys-row", { xPercent: 2.5 }, {
          xPercent: -2.5,
          ease: "none",
          scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", scrub: true },
        });
        return () => split.revert();
      });
    },
    { scope: root },
  );

  function open(journey: Journey, el: HTMLElement) {
    const img = el.querySelector("img");
    if (img) flipState.current = Flip.getState(img);
    setActive(journey);
  }

  useLayoutEffect(() => {
    if (!active || !sheetRef.current) return;
    lenis?.stop();
    const sheet = sheetRef.current;
    const media = sheet.querySelector<HTMLElement>(".journey-sheet-media img");
    const tl = gsap.timeline();
    tl.fromTo(sheet, { backgroundColor: "rgba(13,22,17,0)" }, { backgroundColor: "rgba(13,22,17,0.55)", duration: 0.6 }, 0);
    if (flipState.current && media) {
      tl.add(
        Flip.from(flipState.current, {
          targets: media,
          duration: 1.1,
          ease: "expo.inOut",
          absolute: true,
          scale: true,
        }),
        0,
      );
    }
    tl.from(sheet.querySelectorAll(".js-sheet-reveal"), { y: 30, opacity: 0, stagger: 0.06, duration: 0.9, ease: "expo.out" }, 0.55);
    return () => {
      tl.kill();
    };
  }, [active, lenis]);

  function close() {
    const sheet = sheetRef.current;
    if (!sheet) return setActive(null);
    gsap.to(sheet, {
      opacity: 0,
      duration: 0.45,
      ease: "power2.in",
      onComplete: () => {
        setActive(null);
        lenis?.start();
      },
    });
  }

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section ref={root} id="journeys" className="journeys" data-nav="light" aria-labelledby="journeys-title">
      <div className="wrap journeys-head">
        <h2 id="journeys-title" className="journeys-title display">
          Choose your journey
        </h2>
        <p className="journeys-sub">
          Seven sample plans, each built around a feeling rather than a checklist. Open one to see how the agent
          shaped it.
        </p>
      </div>
      <ul className="journeys-row">
        {journeys.map((j, i) => (
          <li key={j.slug} className={`journey-card jc-${i}`}>
            <button type="button" onClick={(e) => open(j, e.currentTarget)} aria-label={`Open ${j.place} sample plan`}>
              <span className="journey-media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={j.image} alt="" loading="lazy" data-flip-id={`journey-${j.slug}`} />
              </span>
              <span className="journey-meta">
                <span className="journey-place">{j.place}</span>
                <span className="journey-mood mono">{j.mood}</span>
              </span>
              <span className="journey-plus" aria-hidden="true">
                <Icon name="plus" size={16} />
              </span>
            </button>
          </li>
        ))}
      </ul>

      {active && (
        <div
          ref={sheetRef}
          className="journey-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="journey-sheet-title"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div className="journey-sheet-panel" data-lenis-prevent>
            <button type="button" className="journey-sheet-close" onClick={close} aria-label="Close" autoFocus>
              <Icon name="close" size={18} />
            </button>
            <div className="journey-sheet-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={active.image} alt={`${active.place}, ${active.country}`} data-flip-id={`journey-${active.slug}`} />
              <div className="journey-sheet-title-wrap">
                <p className="mono js-sheet-reveal">
                  {active.country} · {active.mood}
                </p>
                <h3 id="journey-sheet-title" className="display js-sheet-reveal">
                  {active.place}
                </h3>
              </div>
            </div>
            <div className="journey-sheet-body">
              <div className="journey-sheet-about js-sheet-reveal">
                <p className="mono">About this plan</p>
                <p className="journey-sheet-blurb">{active.blurb}</p>
              </div>
              <dl className="journey-sheet-facts js-sheet-reveal">
                <div>
                  <dt>Length</dt>
                  <dd>{active.nights} nights</dd>
                </div>
                <div>
                  <dt>From</dt>
                  <dd>{usd.format(active.from)}</dd>
                </div>
                <div>
                  <dt>Paid</dt>
                  <dd>Once, via PayPal</dd>
                </div>
              </dl>
              <ul className="journey-sheet-highlights js-sheet-reveal">
                {active.highlights.map((h) => (
                  <li key={h}>
                    <Icon name="check" size={16} /> {h}
                  </li>
                ))}
              </ul>
              <div className="journey-sheet-actions js-sheet-reveal">
                <Link href={`/plan?q=${encodeURIComponent(`${active.place}, ${active.nights} nights`)}`} className="btn btn-ember">
                  Plan this trip
                  <span className="btn-arrow">
                    <Icon name="arrow" />
                  </span>
                </Link>
                <span className="tag-sample">Sample prices</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
