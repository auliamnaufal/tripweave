"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppTopbar } from "@/components/app/AppTopbar";
import { Icon, type IconName } from "@/components/brand/Icon";
import { usd } from "@/features/ui-mock/data";
import { createOrder } from "@/features/live/client";
import { livePaymentStore } from "@/features/live/liveStore";
import { isLive, useTripView, type AnyTripView } from "@/features/live/useTripView";
import { useHydrated, useTripPrefs } from "@/features/ui-mock/tripStore";
import type { TripPrefs } from "@/features/ui-mock/destinations";
import { DocShareSummary } from "@/components/app/TravelDocs";
import { gsap, useGSAP } from "@/lib/gsap";

const steps = ["Trip summary", "Review & pay", "Booking"];

export function Checkout() {
  const hydrated = useHydrated();
  const prefs = useTripPrefs();
  const view = useTripView();
  if (!hydrated) return <div className="co-page" aria-busy="true" />;
  return <CheckoutInner view={view} prefs={prefs} />;
}

type PayState = { phase: "idle" | "creating" | "approve" | "error"; message?: string; approveUrl?: string };

function CheckoutInner({ view, prefs }: { view: AnyTripView; prefs: TripPrefs }) {
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [pay, setPay] = useState<PayState>({ phase: "idle" });
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
      gsap.from(".co-step", { y: 10, opacity: 0, stagger: 0.08, duration: 0.8, ease: "expo.out" });
      gsap.from(".co-col > *", { y: 40, opacity: 0, stagger: 0.08, duration: 1.1, ease: "expo.out", delay: 0.15 });
    },
    { scope: root },
  );

  async function payLive() {
    if (!isLive(view)) return;
    // Open the window during the click so popup blockers allow it, then point it at PayPal.
    const popup = window.open("", "paypal-approve", "width=520,height=720");
    setPay({ phase: "creating" });
    try {
      const order = await createOrder(view.offers);
      livePaymentStore.set({ ...order, planRetrievedAt: view.offers[0]?.retrievedAt ?? "" });
      if (popup) popup.location.href = order.approveUrl;
      setPay({ phase: "approve", approveUrl: order.approveUrl });
    } catch (e) {
      popup?.close();
      setPay({ phase: "error", message: e instanceof Error ? e.message : "PayPal is unavailable right now." });
    }
  }

  const payDemo = contextSafe(() => {
    setPaying(true);
    gsap
      .timeline({ onComplete: () => router.push("/booked") })
      .fromTo(".co-overlay", { clipPath: "circle(0% at 50% 50%)" }, { clipPath: "circle(150% at 50% 50%)", duration: 1, ease: "power3.inOut" })
      .from(".co-overlay-inner > *", { y: 20, opacity: 0, stagger: 0.1, duration: 0.6 }, 0.5)
      .to(".co-overlay-bar i", { scaleX: 1, duration: 1.6, ease: "power2.inOut" }, 0.6);
  });

  return (
    <div ref={root} className="co-page">
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
                  {view.dates} · {view.travelers} travellers
                </span>
              </div>
            </article>

            <section className="co-card">
              <h2>Lead traveller</h2>
              <div className="co-fields">
                <label>
                  <span>Full name</span>
                  <input defaultValue="Mara Okafor" />
                </label>
                <label>
                  <span>Email for confirmations</span>
                  <input type="email" defaultValue="mara@example.com" />
                </label>
                <label>
                  <span>Second traveller</span>
                  <input defaultValue="Daniel Reyes" />
                </label>
                <label>
                  <span>Phone (optional)</span>
                  <input placeholder="+1 555 010 0199" />
                </label>
              </div>
            </section>

            <section className="co-card">
              <h2>Travel documents</h2>
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
              <div className="budget-bar">
                <i style={{ width: `${(total / view.budget) * 100}%` }} />
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
              <button type="button" className="pay-btn" onClick={live ? () => void payLive() : payDemo} disabled={paying || pay.phase === "creating"}>
                Pay with{" "}
                <b>
                  <span>Pay</span>
                  <span>Pal</span>
                </b>
              </button>
              <p className="co-fine">
                <span className="tag-sample">{live ? "PayPal sandbox" : "Demo"}</span> Tripweave is the merchant of record. Each supplier is then
                booked by our agent with this payment. By paying you agree to the <a href="/legal#terms">Terms</a> and{" "}
                <a href="/legal#privacy">Privacy notice</a>.
              </p>
            </div>
          </aside>
        </div>
      </div>

      {pay.phase !== "idle" && (
        <div className="co-modal" role="dialog" aria-modal="true" aria-labelledby="co-modal-title">
          <div className="co-modal-card">
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
                  Log in with a PayPal <b>sandbox buyer</b> account and press Pay. Then come back here and the agent will
                  capture the payment and book each supplier.
                </p>
                <div className="co-modal-actions">
                  <button type="button" className="btn btn-ember" onClick={() => router.push("/booked")}>
                    I’ve approved, book my trip
                    <span className="btn-arrow">
                      <Icon name="arrow" />
                    </span>
                  </button>
                  <a className="btn btn-ghost" href={pay.approveUrl} target="paypal-approve" rel="noopener">
                    Reopen PayPal
                  </a>
                </div>
                <button type="button" className="co-modal-cancel" onClick={() => setPay({ phase: "idle" })}>
                  Cancel
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
                  <button type="button" className="btn" onClick={() => setPay({ phase: "idle" })}>
                    Back to checkout
                  </button>
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
