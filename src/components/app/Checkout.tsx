"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppTopbar } from "@/components/app/AppTopbar";
import { Icon, type IconName } from "@/components/brand/Icon";
import { usd } from "@/features/ui-mock/data";
import { createOrder, OrderError, type TravellerName } from "@/features/live/client";
import { livePaymentStore, livePlanStore } from "@/features/live/liveStore";
import { isPayPalReturnMessage } from "@/features/live/paypalReturn";
import { syncEdits } from "@/features/live/planEditor";
import { SandboxBuyer } from "@/components/app/SandboxBuyer";
import { isLive, useTripView, type AnyTripView } from "@/features/live/useTripView";
import { useDocs, useHydrated, useTripPrefs, useUser } from "@/features/ui-mock/tripStore";
import { blockers, docMeta } from "@/features/ui-mock/documents";
import type { TripPrefs } from "@/features/ui-mock/destinations";
import { DocShareSummary } from "@/components/app/TravelDocs";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { CheckoutSkeleton } from "@/components/app/Skeleton";

const steps = ["Trip summary", "Review & pay", "Booking"];

export function Checkout() {
  const hydrated = useHydrated();
  const prefs = useTripPrefs();
  const view = useTripView();
  if (!hydrated) return <CheckoutSkeleton />;
  return <CheckoutInner view={view} prefs={prefs} />;
}

type PayState = { phase: "idle" | "creating" | "approve" | "error"; message?: string; approveUrl?: string };

function CheckoutInner({ view, prefs }: { view: AnyTripView; prefs: TripPrefs }) {
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [pay, setPay] = useState<PayState>({ phase: "idle" });
  const [docError, setDocError] = useState("");
  const user = useUser();
  const docs = useDocs();
  const missing = blockers(prefs, docs);
  const docsHeading = useRef<HTMLHeadingElement>(null);
  const modalCard = useRef<HTMLDivElement>(null);
  const payButton = useRef<HTMLButtonElement>(null);
  const travellerCard = useRef<HTMLElement>(null);
  const people = `${view.travelers} ${view.travelers === 1 ? "traveller" : "travellers"}`;

  // Modal: move focus in, close on Escape, give focus back to the pay button.
  useEffect(() => {
    if (pay.phase === "idle") return;
    const target = modalCard.current?.querySelector<HTMLElement>("button, a") ?? modalCard.current;
    target?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && pay.phase !== "creating") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pay.phase]);

  // PayPal redirects its window to /checkout/return (our return_url/cancel_url),
  // which posts the outcome here. Approval only unlocks capture; /booked then
  // captures server-side and checks the real status with PayPal.
  useEffect(() => {
    if (pay.phase !== "approve") return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isPayPalReturnMessage(event.data)) return;
      if (event.data.cancelled) setPay({ phase: "error", message: "You cancelled on PayPal. Nothing was charged." });
      else router.push("/booked");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pay.phase, router]);

  function closeModal() {
    setPay({ phase: "idle" });
    // Wait one task so the page is no longer inert before focusing.
    window.setTimeout(() => payButton.current?.focus(), 0);
  }

  function onPay() {
    if (missing.length) {
      const names = missing.map((r) => docMeta[r.req.kind].label.toLowerCase());
      setDocError(`Add your ${names.join(" and ")} first. The airline and hotel need ${names.length > 1 ? "them" : "it"} to book.`);
      return;
    }
    setDocError("");
    if (live) void payLive();
    else payDemo();
  }

  function goToDocs() {
    docsHeading.current?.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    docsHeading.current?.focus({ preventScroll: true });
  }
  const live = isLive(view);
  const under = view.budget - view.total;
  const total = view.total;
  const lines: { icon: IconName; label: string; sub: string; price: number }[] = [
    ...view.flights.map((f) => ({ icon: "plane" as IconName, label: `${f.from} → ${f.to}`, sub: `${f.airline} · ${f.date}`, price: f.price })),
    { icon: "bed", label: view.hotel.name, sub: `${view.hotel.nights} nights · ${view.hotel.area}`, price: view.hotel.price },
    ...view.activities.map((a) => ({ icon: "compass" as IconName, label: a.title, sub: a.tag, price: a.price })),
  ];

  const { contextSafe } = useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from(".co-step", { y: 10, opacity: 0, stagger: 0.08, duration: 0.8, ease: "expo.out" });
      gsap.from(".co-col > *", { y: 40, opacity: 0, stagger: 0.08, duration: 1.1, ease: "expo.out", delay: 0.15 });
    },
    { scope: root },
  );

  /** The names typed into the traveller card; blank extra travellers become "Guest N". */
  function readTravellers(): TravellerName[] {
    const value = (name: string) => travellerCard.current?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value.trim() ?? "";
    const email = value("email");
    const people: TravellerName[] = [];
    for (let i = 1; i <= view.travelers; i++) {
      const full = value(i === 1 ? "name" : `traveller-${i}`) || (i === 1 ? user?.name ?? "" : "");
      const parts = full.split(/\s+/).filter(Boolean);
      const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] ?? "Guest";
      const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? String(i);
      people.push({ firstName, lastName, ...(i === 1 && email.includes("@") ? { email } : {}) });
    }
    return people;
  }

  async function payLive() {
    if (!isLive(view)) return;
    // Open the window during the click so popup blockers allow it, then point it at PayPal.
    const popup = window.open("", "paypal-approve", "width=520,height=720");
    setPay({ phase: "creating" });
    try {
      // An edit made a moment ago may still be saving: pay the plan on screen, never the one before it.
      if (livePlanStore.get()?.syncing) await syncEdits();
      const fresh = livePlanStore.get();
      if (fresh?.syncing || fresh?.syncError) {
        popup?.close();
        setPay({ phase: "error", message: fresh.syncError ?? "Your last change is still saving. Try again in a moment." });
        return;
      }
      const order = await createOrder(fresh?.quoteId ?? view.quoteId, readTravellers());
      livePaymentStore.set({ ...order, planRetrievedAt: view.offers[0]?.retrievedAt ?? "" });
      if (popup) popup.location.href = order.approveUrl;
      setPay({ phase: "approve", approveUrl: order.approveUrl });
    } catch (e) {
      popup?.close();
      if (e instanceof OrderError && e.repriced) {
        // Swap in the re-priced plan: the page now shows the new total, and the
        // next "Pay" charges the new quote — never the old price, never silently.
        const current = livePlanStore.get();
        if (current) livePlanStore.set({ ...current, plan: e.repriced.plan, quoteId: e.repriced.quoteId });
        setPay({ phase: "error", message: `${e.message} Review the new total, then press Pay again.` });
        return;
      }
      setPay({ phase: "error", message: e instanceof Error ? e.message : "PayPal is unavailable right now." });
    }
  }

  const payDemo = contextSafe(() => {
    setPaying(true);
    if (prefersReducedMotion()) {
      window.setTimeout(() => router.push("/booked"), 900);
      return;
    }
    gsap
      .timeline({ onComplete: () => router.push("/booked") })
      .fromTo(".co-overlay", { clipPath: "circle(0% at 50% 50%)" }, { clipPath: "circle(150% at 50% 50%)", duration: 1, ease: "power3.inOut" })
      .from(".co-overlay-inner > *", { y: 20, opacity: 0, stagger: 0.1, duration: 0.6 }, 0.5)
      .to(".co-overlay-bar i", { scaleX: 1, duration: 1.6, ease: "power2.inOut" }, 0.6);
  });

  return (
    <div ref={root} className="co-page">
      <div className="co-page-body" inert={pay.phase !== "idle" || paying}>
      <AppTopbar back={{ href: "/trip", label: "Back to plan" }} />
      <div className="app-wrap">
        <ol className="co-steps" aria-label="Progress">
          {steps.map((s, i) => (
            <li key={s} className={`co-step ${i === 0 ? "is-done" : ""} ${i === 1 ? "is-current" : ""}`}>
              <span>{i === 0 ? <Icon name="check" size={12} /> : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>

        <div className="co-grid">
          <div className="co-col">
            <h1 className="co-title display">
              One look, <em>one</em> approval.
            </h1>
            <article className="co-trip">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={view.hero} alt="" />
              <div>
                <b>{view.title}</b>
                <span>
                  {view.dates} · {people}
                </span>
              </div>
            </article>

            <section className="co-card" ref={travellerCard}>
              <h2>Travellers</h2>
              <div className="co-fields">
                <label>
                  <span>Full name</span>
                  <input name="name" autoComplete="name" defaultValue={user?.name ?? ""} placeholder="Mara Okafor" />
                </label>
                <label>
                  <span>Email for confirmations</span>
                  <input type="email" name="email" autoComplete="email" defaultValue={user?.email ?? ""} placeholder="you@example.com" />
                </label>
                {Array.from({ length: Math.max(0, view.travelers - 1) }, (_, k) => (
                  <label key={k}>
                    <span>Traveller {k + 2} (as on passport)</span>
                    <input name={`traveller-${k + 2}`} autoComplete="off" placeholder={k === 0 ? "Daniel Reyes" : "Full name"} />
                  </label>
                ))}
                <label>
                  <span>Phone (optional)</span>
                  <input type="tel" name="phone" autoComplete="tel" placeholder="+1 555 010 0199" />
                </label>
              </div>
            </section>

            <section className="co-card">
              <h2 ref={docsHeading} tabIndex={-1}>
                Travel documents
              </h2>
              <DocShareSummary prefs={prefs} suppliers={[view.flights[0]?.airline, view.hotel.name].filter(Boolean)} />
            </section>

            <section className="co-card">
              <h2>What you’re paying for</h2>
              <ul className="co-lines">
                {lines.map((l) => (
                  <li key={l.label}>
                    <span className="co-line-icon">
                      <Icon name={l.icon} size={15} />
                    </span>
                    <span className="co-line-text">
                      <b>{l.label}</b>
                      <small>{l.sub}</small>
                    </span>
                    <span className="co-line-price">{usd.format(l.price)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="co-col co-side">
            <div className="co-pay">
              <span className="mono">Total due today</span>
              <b className="co-total display">{usd.format(total)}</b>
              <div className={`budget-bar ${under < 0 ? "is-over" : ""}`}>
                <i style={{ width: `${Math.min(100, (total / view.budget) * 100)}%` }} />
              </div>
              <p className="co-under">
                {under >= 0 ? `${usd.format(under)} under budget` : `${usd.format(-under)} over budget`} · {live ? "live plan from the agent" : "sample plan"}
              </p>
              <ul className="co-assure">
                <li>
                  <Icon name="shield" size={16} /> One PayPal order for the exact total
                </li>
                <li>
                  <Icon name="wallet" size={16} /> No card or wallet kept after approval
                </li>
                <li>
                  <Icon name="refresh" size={16} /> Any booking that fails is refunded automatically
                </li>
              </ul>
              {docError && (
                <div className="co-pay-error" role="alert">
                  <span>{docError}</span>
                  <button type="button" onClick={goToDocs}>
                    Go to travel documents
                  </button>
                </div>
              )}
              <button ref={payButton} type="button" className="pay-btn" onClick={onPay} disabled={paying || pay.phase === "creating"}>
                Pay with{" "}
                <b>
                  <span>Pay</span>
                  <span>Pal</span>
                </b>
              </button>
              <p className="co-fine">
                {live && (
                  <>
                    Want something different? <a href="/trip">Change flights, stay, activities or dates</a> — anything can change until you approve in PayPal.
                    <br />
                  </>
                )}
                <span className="tag-sample">{live ? "PayPal sandbox" : "Demo"}</span> Tripweave is the merchant of record. Each supplier is then
                booked by our agent with this payment. By paying you agree to the <a href="/legal#terms">Terms</a> and{" "}
                <a href="/legal#privacy">Privacy notice</a>.
              </p>
            </div>
          </aside>
        </div>
      </div>

      </div>

      {pay.phase !== "idle" && (
        <div className="co-modal" role="dialog" aria-modal="true" aria-labelledby="co-modal-title">
          <div className="co-modal-card" ref={modalCard} tabIndex={-1}>
            {pay.phase === "creating" && (
              <>
                <span className="co-knot" aria-hidden="true" />
                <h2 id="co-modal-title">Creating your PayPal order…</h2>
                <p>One order for {usd.format(total)}, built from the exact offers in this plan.</p>
              </>
            )}
            {pay.phase === "approve" && (
              <>
                <span className="co-modal-icon">
                  <Icon name="shield" size={22} />
                </span>
                <h2 id="co-modal-title">Approve it in the PayPal window</h2>
                <p>
                  One approval covers the whole trip. As soon as PayPal sends you back, Tripweave captures the payment and
                  books every item with its platform.
                </p>
                <SandboxBuyer />
                <div className="co-modal-actions">
                  <button type="button" className="btn btn-ember" onClick={() => router.push("/booked")}>
                    Already approved? Continue
                    <span className="btn-arrow">
                      <Icon name="arrow" />
                    </span>
                  </button>
                  <a className="btn btn-ghost" href={pay.approveUrl} target="paypal-approve" rel="noopener">
                    Reopen PayPal
                  </a>
                </div>
                <button type="button" className="co-modal-cancel" onClick={closeModal}>
                  Cancel
                </button>
                <button type="button" className="co-modal-cancel" onClick={() => router.push("/trip")}>
                  Change the plan first (nothing is charged until you approve)
                </button>
              </>
            )}
            {pay.phase === "error" && (
              <>
                <span className="co-modal-icon is-error">
                  <Icon name="close" size={22} />
                </span>
                <h2 id="co-modal-title">PayPal didn’t answer</h2>
                <p>{pay.message}</p>
                <div className="co-modal-actions">
                  <button type="button" className="btn" onClick={closeModal}>
                    Back to checkout
                  </button>
                  {live && (
                    <button type="button" className="btn btn-ghost" onClick={() => router.push("/trip")}>
                      Change the plan
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {paying && (
        <div className="co-overlay" role="status" aria-live="polite">
          <div className="co-overlay-inner">
            <span className="co-knot" aria-hidden="true" />
            <p className="display">Approving with PayPal…</p>
            <span className="co-overlay-bar">
              <i />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
