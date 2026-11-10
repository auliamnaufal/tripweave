"use client";

import { useRef } from "react";
import { gsap, SplitText, useGSAP } from "@/lib/gsap";

const tiles = [
  { src: "/images/m-dunes.webp", cls: "t1", speed: -40, alt: "A walker crossing coastal dunes" },
  { src: "/images/m-grass.webp", cls: "t2", speed: -95, alt: "A hiker in tall golden grass" },
  { src: "/images/m-rock.webp", cls: "t3", speed: -150, alt: "A person resting on a boulder above a gorge" },
  { src: "/images/m-kayak.webp", cls: "t4", speed: -70, alt: "A red kayak on an emerald lake" },
  { src: "/images/m-train.webp", cls: "t5", speed: -120, alt: "A traveller at a train window" },
];

export function Manifesto() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const split = SplitText.create(".manifesto-text", { type: "words", wordsClass: "mf-word" });
        gsap.set(split.words, { opacity: 0.16 });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "+=170%",
            scrub: 0.5,
            pin: ".manifesto-stage",
          },
        });
        tl.to(split.words, { opacity: 1, stagger: 0.05, ease: "none", duration: 0.4 }, 0);

        gsap.utils.toArray<HTMLElement>(".mf-tile").forEach((tile) => {
          const speed = Number(tile.dataset.speed);
          gsap.fromTo(
            tile,
            { yPercent: -speed * 0.6 },
            {
              yPercent: speed * 1.4,
              ease: "none",
              scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", scrub: true },
            },
          );
          gsap.fromTo(
            tile.querySelector("img"),
            { scale: 1.25 },
            { scale: 1, ease: "none", scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", scrub: true } },
          );
        });

        gsap.from(".manifesto-kicker", {
          opacity: 0,
          y: 20,
          scrollTrigger: { trigger: root.current, start: "top 70%" },
        });

        return () => split.revert();
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="manifesto" data-nav="dark" aria-labelledby="manifesto-title">
      <div className="manifesto-stage">
        <div className="manifesto-tiles" aria-hidden="true">
          {tiles.map((t) => (
            <figure key={t.cls} className={`mf-tile ${t.cls}`} data-speed={t.speed}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.src} alt="" loading="lazy" />
            </figure>
          ))}
        </div>
        <div className="manifesto-copy wrap">
          <p className="manifesto-kicker mono" id="manifesto-title">
            Why we built this
          </p>
          <p className="manifesto-text">
            Some trips you plan. The best ones feel like they were waiting for you: the right window seat, a room
            that faces the water, a morning left open on purpose. You tell us how you want to feel. We weave the
            rest, and we never let it cost more than you said.
          </p>
        </div>
      </div>
      <svg className="torn-edge" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M0 120V64l38-9 31 14 44-21 27 9 52-27 33 18 46-10 23 15 41-22 56 25 30-12 47 9 33-26 39 20 52-6 29 17 61-30 37 21 34-9 48 13 30-19 56 8 26-14 47 22 41-16 33 11 54-27 29 18 50-7 35 15 44-24 31 12 39-6V120Z"
          fill="var(--paper)"
        />
        <path
          d="M0 120V82l45-6 30 10 50-15 36 12 48-18 40 13 52-9 30 12 44-14 58 16 34-8 50 6 38-17 42 13 55-4 33 11 60-19 40 14 38-6 50 9 32-12 58 5 30-9 48 14 44-10 36 7 56-17 32 12 52-4 38 10 46-15 34 8 41-4V120Z"
          fill="var(--paper)"
        />
      </svg>
    </section>
  );
}
