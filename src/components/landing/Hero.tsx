"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/brand/Icon";
import { gsap, SplitText, useGSAP } from "@/lib/gsap";

const prompts = ["Kyoto in April, slow mornings", "Lisbon, 4 days, under $1,500", "Oahu with two kids, no red-eyes"];

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const router = useRouter();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        {
          desktop: "(min-width: 820px) and (prefers-reduced-motion: no-preference)",
          mobile: "(max-width: 819px) and (prefers-reduced-motion: no-preference)",
        },
        (ctx) => {
          const { desktop } = ctx.conditions as { desktop: boolean };

          const split = SplitText.create(".hero-title", { type: "lines,words", mask: "lines", linesClass: "sl" });

          const intro = gsap.timeline({ defaults: { ease: "expo.out" } });
          intro
            .from(".hero-plate", { scale: 1.22, duration: 2.6 }, 0)
            .from(".hero-front", { yPercent: 9, scale: 1.08, duration: 2.4 }, 0.1)
            .from(".hero-mist", { opacity: 0, xPercent: -8, duration: 3 }, 0.2)
            .from(split.words, { yPercent: 115, duration: 1.5, stagger: 0.06 }, 0.45)
            .from(".hero-ui > *", { y: 30, opacity: 0, duration: 1.2, stagger: 0.1 }, 1.0)
            .from(".hero-caption", { opacity: 0, duration: 1.2 }, 1.3);

          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: root.current,
              start: "top top",
              end: desktop ? "+=160%" : "+=110%",
              scrub: 0.6,
              pin: ".hero-pin",
              anticipatePin: 1,
            },
          });

          tl.to(".hero-plate", { scale: 1.1, yPercent: -3 }, 0)
            .to(".hero-title-layer", { yPercent: -45, opacity: 0, duration: 0.36, ease: "power1.in" }, 0)
            .to(".hero-front", { scale: desktop ? 1.4 : 1.28, yPercent: 14 }, 0)
            .to(".hero-mist", { xPercent: 8, yPercent: -6, opacity: 1 }, 0)
            .to(".hero-mist-front", { opacity: 1 }, 0)
            .to(".hero-ui", { opacity: 0, y: -40, duration: 0.3 }, 0)
            .fromTo(".hero-beat", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, 0.4)
            .to(".hero-frame", { clipPath: "inset(5% 3.5% 5% 3.5% round 28px)", duration: 0.3, ease: "power2.inOut" }, 0.7)
            .to(".hero-beat", { opacity: 0, y: -30, duration: 0.2 }, 0.8);

          if (desktop) {
            const plateX = gsap.quickTo(".hero-plate-inner", "x", { duration: 1.2, ease: "power3.out" });
            const frontX = gsap.quickTo(".hero-front-inner", "x", { duration: 1.2, ease: "power3.out" });
            const titleX = gsap.quickTo(".hero-title", "x", { duration: 1.4, ease: "power3.out" });
            const onMove = (event: PointerEvent) => {
              const nx = event.clientX / window.innerWidth - 0.5;
              plateX(nx * -10);
              titleX(nx * -18);
              frontX(nx * -34);
            };
            window.addEventListener("pointermove", onMove);
            return () => {
              window.removeEventListener("pointermove", onMove);
              split.revert();
            };
          }
          return () => split.revert();
        },
      );
    },
    { scope: root },
  );

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("q")?.toString().trim();
    router.push(value ? `/plan?q=${encodeURIComponent(value)}` : "/plan");
  }

  return (
    <section ref={root} className="hero" data-nav="light" aria-label="Introduction">
      <div className="hero-pin">
        <div className="hero-frame grain">
          <div className="hero-layer hero-plate">
            <div className="hero-plate-inner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/hero-plate.webp" alt="" fetchPriority="high" />
            </div>
          </div>
          <div className="hero-layer hero-mist" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/hero-mist.webp" alt="" />
          </div>
          <div className="hero-title-layer">
            <h1 className="hero-title display">
              The world, <em>woven</em>
              <br /> around you
            </h1>
          </div>
          <div className="hero-layer hero-front">
            <div className="hero-front-inner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/hero-front.webp" alt="A hiker on a granite outcrop above a misty valley at dusk" fetchPriority="high" />
            </div>
          </div>
          <div className="hero-mist-front" aria-hidden="true" />
          <div className="hero-scrim" aria-hidden="true" />

          <div className="hero-beat">
            <p className="display">
              Tell us how you want to feel.
              <br />
              <em>We find the flights, the bed and the days,</em>
              <br />
              and keep it all under budget.
            </p>
          </div>

          <div className="hero-ui wrap">
            <form className="hero-prompt" onSubmit={submit} role="search">
              <Icon name="spark" size={18} className="hero-prompt-icon" />
              <label htmlFor="hero-q" className="sr-only">
                Describe your trip
              </label>
              <input id="hero-q" name="q" placeholder="Describe a trip: “Lisbon, 4 days, under $1,500”" autoComplete="off" />
              <button type="submit" className="btn btn-ember btn-sm">
                Weave it
                <span className="btn-arrow">
                  <Icon name="arrow" />
                </span>
              </button>
            </form>
            <ul className="hero-suggest" aria-label="Example trips">
              {prompts.map((p) => (
                <li key={p}>
                  <button type="button" onClick={() => router.push(`/plan?q=${encodeURIComponent(p)}`)}>
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <p className="hero-caption mono">
            <span>Sierra Nevada</span>
            <span>37.7° N, 119.5° W</span>
            <span>18:42</span>
          </p>
        </div>
      </div>
    </section>
  );
}
