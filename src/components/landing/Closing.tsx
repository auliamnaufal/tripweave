"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/brand/Icon";
import { LogoMark } from "@/components/brand/Logo";
import { gsap, SplitText, useGSAP } from "@/lib/gsap";

export function Closing() {
  const root = useRef<HTMLElement>(null);
  const router = useRouter();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          ".closing-img",
          { scale: 1.25, yPercent: -6 },
          { scale: 1, yPercent: 0, ease: "none", scrollTrigger: { trigger: ".closing-hero", start: "top bottom", end: "bottom bottom", scrub: true } },
        );
        gsap.fromTo(
          ".closing-hero-frame",
          { clipPath: "inset(10% 8% 0% 8% round 40px 40px 0 0)" },
          {
            clipPath: "inset(0% 0% 0% 0% round 0px 0px 0 0)",
            ease: "none",
            scrollTrigger: { trigger: ".closing-hero", start: "top bottom", end: "top top", scrub: true },
          },
        );
        const split = SplitText.create(".closing-title", { type: "chars", mask: "chars", charsClass: "sc" });
        gsap.from(split.chars, {
          yPercent: 110,
          stagger: 0.03,
          duration: 1.4,
          ease: "expo.out",
          scrollTrigger: { trigger: ".closing-title", start: "top 80%" },
        });
        gsap.from(".closing-form, .closing-note", {
          y: 30,
          opacity: 0,
          stagger: 0.1,
          duration: 1.2,
          ease: "expo.out",
          scrollTrigger: { trigger: ".closing-title", start: "top 75%" },
        });
        gsap.from(".footer-word span", {
          yPercent: 100,
          stagger: 0.04,
          duration: 1.6,
          ease: "expo.out",
          scrollTrigger: { trigger: ".site-footer", start: "top 70%" },
        });
        return () => split.revert();
      });
    },
    { scope: root },
  );

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("q")?.toString().trim();
    router.push(value ? `/plan?q=${encodeURIComponent(value)}` : "/plan");
  }

  return (
    <section ref={root} className="closing" aria-labelledby="closing-title">
      <div className="closing-hero" data-nav="light">
        <div className="closing-hero-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="closing-img" src="/images/c-valley.webp" alt="A glacial valley under low cloud" loading="lazy" />
          <div className="closing-fade" />
        </div>
        <div className="closing-copy wrap">
          <h2 id="closing-title" className="closing-title display">
            Where to next?
          </h2>
          <form className="closing-form" onSubmit={submit} role="search">
            <label htmlFor="closing-q" className="sr-only">
              Describe your next trip
            </label>
            <input id="closing-q" name="q" placeholder="Somewhere green, 5 days, under $2,000" autoComplete="off" />
            <button type="submit" className="btn btn-ember">
              Start weaving
              <span className="btn-arrow">
                <Icon name="arrow" />
              </span>
            </button>
          </form>
          <p className="closing-note mono">Free to plan · you only pay when you approve the trip</p>
        </div>
      </div>

      <footer className="site-footer" data-nav="dark">
        <div className="wrap footer-grid">
          <div className="footer-brand">
            <span className="logo">
              <LogoMark />
              <span>Tripweave</span>
            </span>
            <p>Trips woven to fit how you want to feel, and what you want to spend.</p>
          </div>
          <nav className="footer-col" aria-label="Product">
            <h3 className="mono">Product</h3>
            <Link href="/plan">Planner</Link>
            <Link href="/trip">Sample trip</Link>
            <Link href="/checkout">Checkout</Link>
            <Link href="/lab">Live lab</Link>
          </nav>
          <nav className="footer-col" aria-label="Company">
            <h3 className="mono">Company</h3>
            <a href="#how">How it works</a>
            <a href="#faq">FAQ</a>
            <a href="#journeys">Journeys</a>
          </nav>
          <div className="footer-col">
            <h3 className="mono">Field notes</h3>
            <p className="footer-small">One quiet email a month: a place, a plan, and what it cost.</p>
            <form className="footer-news" onSubmit={(e) => e.preventDefault()}>
              <label htmlFor="news" className="sr-only">
                Email
              </label>
              <input id="news" type="email" placeholder="you@example.com" />
              <button type="submit" aria-label="Subscribe">
                <Icon name="arrow" size={16} />
              </button>
            </form>
          </div>
        </div>
        <p className="footer-word display" aria-hidden="true">
          {"Tripweave".split("").map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </p>
        <div className="wrap footer-legal">
          <span>© 2026 Tripweave</span>
          <span>Payments processed by PayPal. Prices shown are samples.</span>
        </div>
      </footer>
    </section>
  );
}
