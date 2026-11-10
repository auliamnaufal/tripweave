"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/brand/Icon";
import { faqs } from "@/features/ui-mock/data";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

export function Faq() {
  const root = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<number | null>(0);

  useGSAP(
    () => {
      gsap.from(".faq-item", {
        y: 30,
        opacity: 0,
        stagger: 0.07,
        duration: 1,
        ease: "expo.out",
        scrollTrigger: { trigger: ".faq-list", start: "top 80%" },
      });
    },
    { scope: root },
  );

  function toggle(i: number) {
    const next = open === i ? null : i;
    const panels = root.current?.querySelectorAll<HTMLElement>(".faq-panel");
    panels?.forEach((panel, k) => {
      const shouldOpen = k === next;
      gsap.to(panel, {
        height: shouldOpen ? "auto" : 0,
        duration: 0.6,
        ease: "power3.inOut",
        onComplete: () => ScrollTrigger.refresh(),
      });
    });
    setOpen(next);
  }

  return (
    <section ref={root} id="faq" className="faq" data-nav="light" aria-labelledby="faq-title">
      <div className="wrap faq-inner">
        <div className="faq-head">
          <h2 id="faq-title" className="display">
            Fair <em>questions</em>
          </h2>
          <p>Straight answers about money, bookings and what the AI is and isn’t allowed to decide.</p>
        </div>
        <ul className="faq-list">
          {faqs.map((f, i) => (
            <li key={f.q} className={`faq-item ${open === i ? "is-open" : ""}`}>
              <button type="button" aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => toggle(i)}>
                <span>{f.q}</span>
                <i aria-hidden="true">
                  <Icon name="plus" size={18} />
                </i>
              </button>
              <div id={`faq-${i}`} className="faq-panel" style={{ height: i === 0 ? "auto" : 0 }} role="region">
                <p>{f.a}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
