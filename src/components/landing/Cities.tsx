"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/brand/Icon";
import { cities, usd } from "@/features/ui-mock/data";
import { gsap, SplitText, useGSAP, type ScrollTrigger } from "@/lib/gsap";
import { useLenis } from "@/components/motion/SmoothScroll";

export function Cities() {
  const root = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0);
  const triggerRef = useRef<ScrollTrigger | null>(null);
  const lenis = useLenis();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const slides = gsap.utils.toArray<HTMLElement>(".city-slide");
        const splits = slides.map((s) => SplitText.create(s.querySelector(".city-name"), { type: "chars", mask: "chars", charsClass: "sc" }));

        gsap.set(slides.slice(1), { clipPath: "inset(100% 0% 0% 0%)" });
        slides.slice(1).forEach((s, i) => {
          gsap.set(splits[i + 1].chars, { yPercent: 110 });
          gsap.set(s.querySelectorAll(".city-reveal"), { opacity: 0, y: 24 });
          gsap.set(s.querySelector(".city-sun"), { scale: 0.4, opacity: 0 });
        });

        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: () => `+=${(slides.length - 1) * 110}%`,
            scrub: 0.7,
            pin: true,
            snap: { snapTo: "labels", duration: { min: 0.3, max: 0.9 }, ease: "power2.inOut", delay: 0.08 },
            onUpdate: (self) => setIndex(Math.round(self.progress * (slides.length - 1))),
          },
        });
        triggerRef.current = tl.scrollTrigger ?? null;

        tl.addLabel("s0");
        slides.forEach((slide, i) => {
          if (i === 0) return;
          const prev = slides[i - 1];
          const at = i - 1;
          tl.to(splits[i - 1].chars, { yPercent: -110, stagger: 0.02, duration: 0.35, ease: "power2.in" }, at)
            .to(prev.querySelectorAll(".city-reveal"), { opacity: 0, y: -20, duration: 0.25 }, at)
            .to(prev.querySelector(".city-img"), { scale: 1.08, yPercent: -6, duration: 1 }, at)
            .to(slide, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.8, ease: "power3.inOut" }, at + 0.1)
            .fromTo(slide.querySelector(".city-img"), { scale: 1.3, yPercent: 8 }, { scale: 1.02, yPercent: 0, duration: 0.9, ease: "power2.out" }, at + 0.1)
            .to(slide.querySelector(".city-sun"), { scale: 1, opacity: 1, duration: 0.6, ease: "power3.out" }, at + 0.45)
            .to(splits[i].chars, { yPercent: 0, stagger: 0.03, duration: 0.45, ease: "power3.out" }, at + 0.5)
            .to(slide.querySelectorAll(".city-reveal"), { opacity: 1, y: 0, stagger: 0.05, duration: 0.35, ease: "power2.out" }, at + 0.6)
            .addLabel(`s${i}`, at + 1);
        });

        gsap.from(slides[0].querySelector(".city-center"), {
          y: 80,
          opacity: 0,
          duration: 1.4,
          ease: "expo.out",
          scrollTrigger: { trigger: root.current, start: "top 55%" },
        });

        return () => splits.forEach((s) => s.revert());
      });
    },
    { scope: root },
  );

  function jump(i: number) {
    const st = triggerRef.current;
    if (!st) return;
    const y = st.start + ((st.end - st.start) * i) / (cities.length - 1);
    if (lenis) lenis.scrollTo(y, { duration: 1.4 });
    else window.scrollTo({ top: y, behavior: "smooth" });
  }

  return (
    <section ref={root} id="cities" className="cities" data-nav="dark" aria-label="Places people are weaving now">
      <div className="cities-stage">
        {cities.map((c, i) => (
          <article key={c.name} className="city-slide" aria-hidden={index !== i}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="city-img" src={c.image} alt="" loading="lazy" />
            <div className="city-shade" />
            <div className="city-center">
              <span className="city-sun" aria-hidden="true" />
              <p className="city-native city-reveal">{c.native}</p>
              <h2 className="city-name display">{c.name}</h2>
              <p className="city-line city-reveal">{c.line}</p>
              <div className="city-actions city-reveal">
                <Link href={`/plan?q=${encodeURIComponent(`${c.name}, ${c.nights} nights`)}`} className="btn btn-ember btn-sm">
                  Plan {c.name}
                  <span className="btn-arrow">
                    <Icon name="arrow" />
                  </span>
                </Link>
                <span className="city-meta mono">
                  {c.nights} nights · from {usd.format(c.from)} · sample
                </span>
              </div>
            </div>
          </article>
        ))}

        <p className="cities-label mono">Places people are weaving now</p>
        <ol className="cities-thumbs" aria-label="Choose a place">
          {cities.map((c, i) => (
            <li key={c.name}>
              <button
                type="button"
                className={i === index ? "is-active" : ""}
                onClick={() => jump(i)}
                aria-current={i === index}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.image} alt="" loading="lazy" />
                <span>
                  <small className="mono">{c.country}</small>
                  {c.name}
                </span>
                <i className="cities-progress" style={{ transform: `scaleX(${i <= index ? 1 : 0})` }} />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
