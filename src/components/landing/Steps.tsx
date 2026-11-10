"use client";

import { useRef, useState } from "react";
import { steps } from "@/features/ui-mock/data";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

export function Steps() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", () => {
        const frames = gsap.utils.toArray<HTMLElement>(".step-frame");
        gsap.set(frames.slice(1), { clipPath: "inset(100% 0% 0% 0% round 22px)" });

        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: `+=${steps.length * 70}%`,
            scrub: 0.6,
            pin: ".steps-stage",
            onUpdate: (self) => setActive(Math.min(steps.length - 1, Math.floor(self.progress * steps.length))),
          },
        });
        frames.forEach((frame, i) => {
          const img = frame.querySelector("img");
          tl.to(img, { scale: 1, duration: 1 }, i);
          tl.to(`.step-item:nth-child(${i + 1}) .step-bar i`, { scaleX: 1, duration: 1 }, i);
          if (i > 0) {
            tl.to(frame, { clipPath: "inset(0% 0% 0% 0% round 22px)", duration: 0.45, ease: "power3.inOut" }, i - 0.2);
          }
        });
        return () => setActive(0);
      });

      mm.add("(max-width: 899px) and (prefers-reduced-motion: no-preference)", () => {
        gsap.utils.toArray<HTMLElement>(".step-item").forEach((item) => {
          gsap.from(item, { y: 50, opacity: 0, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: item, start: "top 85%" } });
        });
      });

      gsap.from(".steps-head > *", {
        y: 40,
        opacity: 0,
        stagger: 0.1,
        duration: 1.2,
        ease: "expo.out",
        scrollTrigger: { trigger: root.current, start: "top 75%" },
      });
      ScrollTrigger.refresh();
    },
    { scope: root },
  );

  return (
    <section ref={root} id="how" className="steps" data-nav="light" aria-labelledby="steps-title">
      <div className="steps-stage wrap">
        <div className="steps-media" aria-hidden="true">
          {steps.map((s, i) => (
            <figure key={s.title} className="step-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.image} alt="" loading="lazy" />
              <figcaption className="mono">
                <span>0{i + 1}</span>
                {s.meta}
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="steps-copy">
          <div className="steps-head">
            <p className="mono">How it works</p>
            <h2 id="steps-title" className="display">
              Four steps. <em>One</em> of them is yours.
            </h2>
          </div>
          <ol className="steps-list">
            {steps.map((s, i) => (
              <li key={s.title} className={`step-item ${i === active ? "is-active" : ""} ${i < active ? "is-done" : ""}`}>
                <span className="step-num mono">0{i + 1}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="step-inline-img" src={s.image} alt="" loading="lazy" />
                </div>
                <span className="step-bar" aria-hidden="true">
                  <i />
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
