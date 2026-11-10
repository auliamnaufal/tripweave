"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LogoMark } from "@/components/brand/Logo";
import { Icon } from "@/components/brand/Icon";
import { DEMO_USER, historyStore, userStore } from "@/features/ui-mock/tripStore";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

export function Login() {
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/plan";
  const [loading, setLoading] = useState(false);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap
        .timeline({ defaults: { ease: "expo.out" } })
        .from(".lg-photo img", { scale: 1.2, duration: 2.2 }, 0)
        .from(".lg-photo-copy > *", { y: 30, opacity: 0, stagger: 0.08, duration: 1.2 }, 0.3)
        .from(".lg-form > *", { y: 24, opacity: 0, stagger: 0.06, duration: 1 }, 0.15);
    },
    { scope: root },
  );

  function signInDemo() {
    setLoading(true);
    userStore.set(DEMO_USER);
    if (historyStore.get().length === 0) {
      historyStore.set([
        { id: "seed-lisbon", title: "Lisbon, 4 nights", destId: "lisbon", at: "2026-10-02T10:00:00.000Z" },
        { id: "seed-kyoto", title: "Kyoto, 6 nights", destId: "kyoto", at: "2026-09-14T10:00:00.000Z" },
      ]);
    }
    setTimeout(() => router.push(next), 700);
  }

  return (
    <div ref={root} className="lg">
      <aside className="lg-photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/m-tent.webp" alt="A lit tent in an alpine meadow at blue hour" />
        <div className="lg-photo-copy">
          <Link href="/" className="logo lg-logo-light">
            <LogoMark />
            <span>Tripweave</span>
          </Link>
          <blockquote>
            “Tell it how you want the trip to feel. It handles the twenty tabs.”
          </blockquote>
          <p className="mono">Sample plan · Dolomites · 6 nights</p>
        </div>
      </aside>

      <main className="lg-main">
        <div className="lg-form">
          <Link href="/" className="logo lg-logo-mobile">
            <LogoMark />
            <span>Tripweave</span>
          </Link>
          <h1>Welcome back</h1>
          <p className="lg-sub">Sign in to keep your plans, bookings and receipts in one place.</p>

          <button type="button" className="lg-demo" onClick={signInDemo} disabled={loading}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={DEMO_USER.avatar} alt="" />
            <span>
              <b>{loading ? "Signing you in…" : "Continue with demo account"}</b>
              <small>
                {DEMO_USER.name} · {DEMO_USER.email}
              </small>
            </span>
            <span className="lg-demo-arrow">{loading ? <i className="bk-spin" /> : <Icon name="arrow" size={16} />}</span>
          </button>

          <p className="lg-note">
            <Icon name="shield" size={14} /> Email and Google sign-in arrive with the real backend. The demo account keeps everything in
            this browser.
          </p>
          <p className="lg-foot">
            New here? <Link href="/plan">Plan a trip without an account</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
