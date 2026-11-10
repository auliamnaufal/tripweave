"use client";

import { useEffect, useRef, useState } from "react";
import { testimonials } from "@/features/ui-mock/data";
import { gsap, useGSAP } from "@/lib/gsap";

export function Stories() {
  const root = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const quoteRef = useRef<HTMLQuoteElement>(null);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % testimonials.length), 7000);
    return () => window.clearInterval(id);
  }, [paused]);

  useGSAP(
    () => {
      gsap.fromTo(
        ".stories-photo.is-active",
        { clipPath: "inset(0% 0% 100% 0% round 22px)" },
        { clipPath: "inset(0% 0% 0% 0% round 22px)", duration: 1.1, ease: "expo.inOut" },
      );
      gsap.fromTo(".stories-photo.is-active img", { scale: 1.18 }, { scale: 1, duration: 1.6, ease: "expo.out" });
      gsap.fromTo(
        quoteRef.current,
        { opacity: 0, y: 24, filter: "blur(6px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.9, ease: "expo.out" },
      );
    },
    { scope: root, dependencies: [index] },
  );

  const t = testimonials[index];

  return (
    <section
      ref={root}
      className="stories"
      data-nav="light"
      aria-labelledby="stories-title"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div className="wrap stories-inner">
        <div className="stories-copy">
        <div className="stories-head">
          <h2 id="stories-title" className="mono">
            From the road
          </h2>
          <span className="tag-sample">Placeholder stories</span>
        </div>
        <blockquote ref={quoteRef} className="stories-quote display" aria-live="polite">
          <p>“{t.quote}”</p>
          <footer>
            <b>{t.name}</b>
            <span>{t.trip}</span>
          </footer>
        </blockquote>
        <div className="stories-people" role="tablist" aria-label="Choose a story">
          {testimonials.map((p, i) => (
            <button
              key={p.name}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={i === index ? "is-active" : ""}
              onClick={() => setIndex(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.avatar} alt="" loading="lazy" />
              <span>
                <b>{p.name}</b>
                <small>{p.trip}</small>
              </span>
              {i === index && !paused && <i className="stories-timer" key={index} />}
            </button>
          ))}
        </div>
        </div>
        <div className="stories-media">
          {testimonials.map((p, i) => (
            <figure key={p.name} className={`stories-photo ${i === index ? "is-active" : ""}`} aria-hidden={i !== index}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.photo} alt={`Photo from ${p.name}’s trip`} loading="lazy" />
              <figcaption>
                <span className="mono">Shot by {p.name.split(" ")[0]}</span>
                {p.place}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
