"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LogoMark } from "@/components/brand/Logo";
import { Icon } from "@/components/brand/Icon";
import { DEMO_USER } from "@/features/ui-mock/tripStore";
import { SignedInRedirect } from "@/components/landing/SignedInRedirect";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { createClient } from "@/lib/supabase/client";
import { hydrateFromServer } from "@/features/db/sync";

export function Login() {
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const params = useSearchParams();
  const asked = params.get("next");
  // Only follow paths inside this site ("/plan", not "//evil.example").
  const next = asked && asked.startsWith("/") && !asked.startsWith("//") ? asked : "/plan";
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authError, setAuthError] = useState("");

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

  /** A real Supabase session for the shared demo account (see /api/auth/demo), not a local stand-in. */
  async function signInDemo() {
    setAuthError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/demo", { method: "POST" });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "The demo account is unavailable.");
      // Fill the local stores from the new session before leaving, so the
      // next page renders signed in instead of bouncing back here.
      await hydrateFromServer();
      router.replace(next);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "The demo account is unavailable.");
      setLoading(false);
    }
  }

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setLoading(true);
    try {
      if (mode === "signup") {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name: name || email.split("@")[0] }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Could not create that account.");
        }
      }
      const { error } = await createClient().auth.signInWithPassword({ email, password });
      if (error) throw new Error(mode === "signup" ? "Account created, but sign-in failed — try signing in." : "Wrong email or password.");
      // Populate the local userStore before navigating — /plan gates on it being
      // set, and that normally happens async off the auth-state listener, which
      // would otherwise lose the race against this navigation and bounce right
      // back to /login.
      await hydrateFromServer();
      router.replace(next);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div ref={root} className="lg">
      {/* Already signed in: there's nothing to do here, carry on to where they were going. */}
      <SignedInRedirect to={next} />
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
          <h1>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
          <p className="lg-sub">
            {mode === "signup" ? "One account for your plans, bookings, e-tickets and receipts." : "Sign in to keep your plans, bookings and receipts in one place."}
          </p>

          <button type="button" className="lg-demo" onClick={signInDemo} disabled={loading}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={DEMO_USER.avatar} alt="" />
            <span>
              <b>{loading ? "Signing you in…" : "Continue with demo account"}</b>
              <small>
                {DEMO_USER.name} · demo@tripweave.example
              </small>
            </span>
            <span className="lg-demo-arrow">{loading ? <i className="bk-spin" /> : <Icon name="arrow" size={16} />}</span>
          </button>

          <div className="lg-divider">
            <span>or</span>
          </div>


          <form className="lg-fields" onSubmit={submitAuth}>
            {mode === "signup" && (
              <label>
                <span>Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mara Okafor" />
              </label>
            )}
            <label>
              <span>Email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>
            <label>
              <span>Password</span>
              <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </label>
            {authError && <p className="lg-error">{authError}</p>}
            <button type="submit" className="btn" disabled={loading}>
              {loading ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>
          <p className="lg-note">
            <Icon name="shield" size={14} /> {mode === "signup" ? "Your plans, chat, and receipts sync to your account." : "Sign in to pick up your trips, chat, and receipts."}
          </p>
          <p className="lg-foot">
            {mode === "signup" ? (
              <>
                Have an account?{" "}
                <button type="button" className="lg-link" onClick={() => setMode("signin")}>
                  Sign in
                </button>
              </>
            ) : (
              <>
                New here?{" "}
                <button type="button" className="lg-link" onClick={() => setMode("signup")}>
                  Create an account
                </button>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
