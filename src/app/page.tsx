"use client";

import { useState } from "react";
import Link from "next/link";
import { itineraryPlanSchema, type ItineraryPlanView } from "@/features/planner/travelOffer";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type Payment = { orderId: string; approveUrl: string };

const PREFERENCE_SUGGESTIONS = ["beach", "local food", "nightlife", "nature", "museums", "relaxed pace"];

function violationText(violation: ItineraryPlanView["violations"][number]): string {
  if (violation.kind === "over-budget") return "Over budget";
  if (violation.kind === "outside-trip-window") return "An offer falls outside the trip dates";
  if (violation.kind === "invalid-time-range") return "An offer has invalid times";
  return "Two offers overlap in the schedule";
}

const categoryLabels: Record<ItineraryPlanView["budgetByCategory"][number]["productKind"], string> = {
  flight: "Flights",
  hotel: "Hotel",
  activity: "Activities",
};

function dateInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function isErrorStatus(status: string): boolean {
  return (
    status.includes("unavailable") ||
    status.includes("failed") ||
    status.includes("Could not") ||
    status.includes("invalid")
  );
}

export default function Home() {
  const [originCity, setOriginCity] = useState("San Francisco");
  const [originCountry, setOriginCountry] = useState("United States");
  const [city, setCity] = useState("Honolulu");
  const [country, setCountry] = useState("United States");
  const [startDate, setStartDate] = useState(() => dateInDays(30));
  const [endDate, setEndDate] = useState(() => dateInDays(34));
  const [travelers, setTravelers] = useState(2);
  const [budget, setBudget] = useState(3500);
  const [preferences, setPreferences] = useState("beach, local food");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [plan, setPlan] = useState<ItineraryPlanView | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [paymentStatus, setPaymentStatus] = useState("");

  function addPreference(tag: string) {
    const current = preferences.split(",").map((item) => item.trim()).filter(Boolean);
    if (current.includes(tag)) return;
    setPreferences([...current, tag].join(", "));
  }

  async function planTrip() {
    setLoading(true);
    setStatus("Planning your trip...");
    setPlan(null);
    setNote("");
    setPayment(null);
    setPaymentStatus("");
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { city: originCity, country: originCountry },
          destination: { city, country },
          timeZone: "UTC",
          travelers,
          travelWindow: {
            startsAt: `${startDate}T00:00:00Z`,
            endsAt: `${endDate}T23:59:59Z`,
          },
          hardBudget: { currency: "USD", amountMinorUnits: Math.round(budget * 100) },
          preferences: preferences.split(",").map((item) => item.trim()).filter(Boolean),
          constraints: [],
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        setStatus((result as { error?: string }).error ?? "Planning failed.");
        return;
      }
      const parsed = itineraryPlanSchema.safeParse((result as { plan?: unknown }).plan);
      if (!parsed.success) {
        setStatus("The planner returned an invalid plan.");
        return;
      }
      setPlan(parsed.data);
      setNote((result as { note?: string }).note ?? "");
      setStatus("");
    } catch {
      setStatus("Could not reach the planner.");
    } finally {
      setLoading(false);
    }
  }

  async function startPayment() {
    setPaymentStatus("");
    setPayment(null);
    try {
      const response = await fetch("/api/payments/order", { method: "POST" });
      const result: unknown = await response.json();
      if (!response.ok) {
        setPaymentStatus((result as { error?: string }).error ?? "Payment unavailable.");
        return;
      }
      const order = result as Payment;
      setPayment(order);
      setPaymentStatus("Open the approval link, then confirm your payment.");
    } catch {
      setPaymentStatus("Could not start payment.");
    }
  }

  async function confirmPayment() {
    if (!payment) return;
    setPaymentStatus("Confirming payment...");
    try {
      const response = await fetch("/api/payments/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: payment.orderId }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        setPaymentStatus((result as { error?: string }).error ?? "Payment failed.");
        return;
      }
      setPaymentStatus(`Payment status: ${(result as { status: string }).status}`);
    } catch {
      setPaymentStatus("Could not confirm payment.");
    }
  }

  return (
    <div className="planner-shell">
      <div className="topbar">
        <Link href="/" className="wordmark">
          <span className="wordmark-mark" aria-hidden="true">T</span>
          Tripweave
        </Link>
        <span className="demo-status">
          <span aria-hidden="true">●</span>Plan costs $5 · not a travel booking
        </span>
      </div>

      <div className="notice">
        <span className="notice-icon" aria-hidden="true">i</span>
        <p>
          <strong>Live flight search, sample hotels &amp; activities.</strong> The agent searches real Duffel
          flight fares; hotel and activity offers are clearly labeled synthetic fixtures.
        </p>
      </div>

      <main className="content">
        <div className="intro">
          <p className="eyebrow">
            <span className="eyebrow-line" aria-hidden="true" />
            Constraint-aware trip planning
          </p>
          <h1>
            Plan a trip that actually <em>fits</em>.
          </h1>
          <p className="intro-copy">
            Describe where you want to go. An agent assembles an itinerary from real and sample offers, and
            the app, not the model, checks the dates, the schedule, and the budget.
          </p>
        </div>

        <div className="trip-context">
          <div className="section-heading">
            <h2>
              <span className="trip-mark" aria-hidden="true">✈</span> {originCity || "Origin"} → {city || "Destination"}
            </h2>
          </div>
          <dl className="trip-facts">
            <div>
              <dt>Route</dt>
              <dd>{originCity}, {originCountry} → {city}, {country}</dd>
            </div>
            <div>
              <dt>Dates</dt>
              <dd>{startDate} – {endDate}</dd>
            </div>
            <div>
              <dt>Travelers</dt>
              <dd>{travelers}</dd>
            </div>
            <div>
              <dt>Hard budget</dt>
              <dd>{money.format(budget)}</dd>
            </div>
          </dl>
        </div>

        <div className="decision-grid">
          <section className="preference-panel">
            <div className="panel-heading">
              <span className="step-number" aria-hidden="true">1</span>
              <div>
                <p className="section-kicker">Trip brief</p>
                <h2>Where and when</h2>
              </div>
            </div>
            <p className="panel-copy">
              Fill in the basics. The agent uses this exactly as written, it can&apos;t change dates, budget, or
              totals.
            </p>

            <div className="field-row field-row-2">
              <label className="field">
                Leaving from (city)
                <input value={originCity} onChange={(event) => setOriginCity(event.target.value)} />
              </label>
              <label className="field">
                Leaving from (country)
                <input value={originCountry} onChange={(event) => setOriginCountry(event.target.value)} />
              </label>
            </div>
            <div className="field-row field-row-2" style={{ marginTop: 12 }}>
              <label className="field">
                Going to (city)
                <input value={city} onChange={(event) => setCity(event.target.value)} />
              </label>
              <label className="field">
                Going to (country)
                <input value={country} onChange={(event) => setCountry(event.target.value)} />
              </label>
            </div>
            <div className="field-row field-row-4" style={{ marginTop: 12 }}>
              <label className="field">
                Start
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label className="field">
                End
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </label>
              <label className="field">
                Travelers
                <input
                  type="number"
                  min={1}
                  value={travelers}
                  onChange={(event) => setTravelers(Number(event.target.value))}
                />
              </label>
              <label className="field">
                Budget (USD)
                <input
                  type="number"
                  min={1}
                  value={budget}
                  onChange={(event) => setBudget(Number(event.target.value))}
                />
              </label>
            </div>
            <label className="field" style={{ marginTop: 12 }}>
              Preferences
              <input
                value={preferences}
                onChange={(event) => setPreferences(event.target.value)}
                placeholder="beach, local food"
              />
            </label>
            <div style={{ marginTop: 8 }}>
              {PREFERENCE_SUGGESTIONS.map((tag) => (
                <button key={tag} type="button" className="chip-button" onClick={() => addPreference(tag)}>
                  + {tag}
                </button>
              ))}
            </div>

            <button type="button" className="guidance-button" onClick={planTrip} disabled={loading}>
              {loading ? "Planning..." : "Plan my trip"}
              <span aria-hidden="true">→</span>
            </button>
            <p className="ai-caption">
              An agent searches flights, hotels, and activities, then the app recomputes totals and feasibility
              from its picks before you see them.
            </p>
            {status && (
              <p className={isErrorStatus(status) ? "inline-error" : "inline-status"} role="status">
                {status}
              </p>
            )}
          </section>

          <section className="comparison-panel">
            <div className="comparison-header">
              <div className="panel-heading" style={{ gap: 0 }}>
                <h2>Your plan</h2>
              </div>
              {plan && <span className="fixture-label">{note ? "AI-assembled" : "Recomputed"}</span>}
            </div>

            {!plan && (
              <p className="panel-copy" style={{ marginTop: 12 }}>
                No plan yet. Fill in the trip brief and select &ldquo;Plan my trip&rdquo; to see offers, a
                day-by-day schedule, and a budget breakdown here.
              </p>
            )}

            {plan && (
              <div className="bundle-list" style={{ marginTop: 16 }}>
                <article className="bundle">
                  <div className="bundle-topline">
                    <span className="bundle-name">{money.format(plan.totalCostMinorUnits / 100)} total</span>
                    {plan.status === "feasible" ? (
                      <span className="fit-status fit">
                        <span aria-hidden="true">✓</span>Fits your budget
                      </span>
                    ) : (
                      <span className="fit-status not-fit">
                        <span aria-hidden="true">!</span>Needs changes
                      </span>
                    )}
                  </div>

                  <dl className="bundle-facts">
                    {plan.budgetByCategory.map((item) => (
                      <div key={item.productKind}>
                        <dt>{categoryLabels[item.productKind]}</dt>
                        <dd>{money.format(item.subtotalMinorUnits / 100)}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="bundle-bottom">
                    <div>
                      <span className="total-label">Total</span>
                      <span className="total">{money.format(plan.totalCostMinorUnits / 100)}</span>
                    </div>
                    {plan.status === "feasible" ? (
                      <span className="remaining">
                        {money.format((plan.budgetRemainingMinorUnits ?? 0) / 100)} remaining
                      </span>
                    ) : (
                      <span className="constraint-note">Doesn&apos;t fit the brief</span>
                    )}
                  </div>

                  {note && (
                    <p className="ai-explanation">
                      <span>AI</span> {note}
                    </p>
                  )}
                </article>

                {plan.violations.length > 0 && (
                  <div className="no-fit">
                    <strong>Doesn&apos;t fit yet</strong>
                    <span>{plan.violations.map(violationText).join(" · ")}</span>
                  </div>
                )}

                <div>
                  <div className="section-heading" style={{ marginTop: 18, marginBottom: 8 }}>
                    <h3 className="subsection-heading">Offers</h3>
                  </div>
                  <ul className="offer-list">
                    {plan.offers.map((offer) => (
                      <li key={offer.id} className="offer-card">
                        <div className="offer-top">
                          <span>
                            <span className="offer-title">{offer.title}</span>
                            <span className="offer-kind">{offer.productKind}</span>
                            {offer.synthetic && <span className="synthetic-tag">Sample</span>}
                          </span>
                          <span className="offer-price">{money.format(offer.costMinorUnits / 100)}</span>
                        </div>
                        <p className="offer-summary">{offer.summary}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="section-heading" style={{ marginTop: 18, marginBottom: 8 }}>
                    <h3 className="subsection-heading">Day by day</h3>
                  </div>
                  <ul className="day-list">
                    {plan.days.map((day) => (
                      <li key={day.date} className="day-card">
                        <div className="day-top">
                          <span className="day-date">{day.date}</span>
                          <span className="day-total">{money.format(day.subtotalMinorUnits / 100)}</span>
                        </div>
                        {day.offers.length === 0 ? (
                          <p className="day-empty">Nothing scheduled</p>
                        ) : (
                          <ul className="day-offers">
                            {day.offers.map((offer) => (
                              <li key={offer.id}>
                                <span>{offer.title}</span>
                                <span>{money.format(offer.costMinorUnits / 100)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="section-heading" style={{ marginTop: 18, marginBottom: 8 }}>
                    <h3 className="subsection-heading">Budget breakdown</h3>
                  </div>
                  <ul className="budget-list">
                    {plan.budgetByCategory.map((item) => (
                      <li key={item.productKind} className="budget-row">
                        <span>{categoryLabels[item.productKind]}</span>
                        <span>{money.format(item.subtotalMinorUnits / 100)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {plan.status === "feasible" && (
                  <div className="payment-panel">
                    <button type="button" className="guidance-button" onClick={startPayment}>
                      Buy this plan for $5
                      <span aria-hidden="true">→</span>
                    </button>
                    <p className="payment-note">
                      You are buying Tripweave&apos;s itinerary plan, not a hotel or flight booking. Sample
                      offers stay clearly labeled.
                    </p>
                  </div>
                )}

                {payment && (
                  <div style={{ marginTop: 12 }}>
                    <a href={payment.approveUrl} target="_blank" rel="noreferrer" className="approve-link">
                      Open PayPal approval →
                    </a>
                    <div>
                      <button type="button" className="secondary-button" onClick={confirmPayment}>
                        Confirm payment
                      </button>
                    </div>
                  </div>
                )}
                {paymentStatus && (
                  <p className="inline-status" role="status" style={{ marginTop: 8 }}>
                    {paymentStatus}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="page-footer">
          <p>Prices, availability, and booking state are synthetic except live flight fares. Nothing is booked or reserved here.</p>
          <span>TRIPWEAVE · DEMO</span>
        </div>
      </main>
    </div>
  );
}
