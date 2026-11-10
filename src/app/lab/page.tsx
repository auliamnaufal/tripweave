"use client";

import { useState } from "react";
import Link from "next/link";
import "./lab.css";
import { itineraryPlanSchema, type ItineraryPlanView, type TravelOfferView } from "@/features/planner/travelOffer";
import type { PlanStreamEvent } from "@/app/api/plan/route";
import type { CaptureStreamEvent } from "@/app/api/payments/capture/route";

type BookingSummary = Extract<CaptureStreamEvent, { kind: "summary" }>;
type DirectPaymentEvent = Extract<CaptureStreamEvent, { kind: "direct-payment" }>;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type Payment = { orderId: string; approveUrl: string };

type ProcessEntry =
  | { kind: "step"; tool: string; label: string; summary?: string }
  | { kind: "note"; text: string };

/** Splits a fetch stream into newline-delimited JSON objects, buffering partial lines across chunks. */
async function* readNdjson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line) yield JSON.parse(line) as T;
      newlineIndex = buffer.indexOf("\n");
    }
  }
}

/** Picks which offer the demo deliberately fails to book, so the failure+refund branch is reliable on stage. */
function pickDemoFailureOfferId(offers: readonly TravelOfferView[]): string | undefined {
  return (offers.find((offer) => offer.productKind === "activity") ?? offers[0])?.id;
}

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
  const [process, setProcess] = useState<ProcessEntry[]>([]);
  const [note, setNote] = useState("");
  const [plan, setPlan] = useState<ItineraryPlanView | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [paymentStatus, setPaymentStatus] = useState("");
  const [booking, setBooking] = useState(false);
  const [bookingProcess, setBookingProcess] = useState<ProcessEntry[]>([]);
  const [bookingSummary, setBookingSummary] = useState<BookingSummary | null>(null);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [directPayeeOfferId, setDirectPayeeOfferId] = useState("");
  const [directPayeeEmail, setDirectPayeeEmail] = useState("");
  const [directPayments, setDirectPayments] = useState<DirectPaymentEvent[]>([]);

  const [quoteId, setQuoteId] = useState<string | null>(null);

  // Demo-only (server needs DEMO_MODE=true): no supplier registry exists, so the
  // Onboarded Supplier case is exercised by hand — pick one offer and give it a
  // PayPal email. The server applies it to its own stored quote.
  function demoDirectPayee(): { offerId: string; email: string } | undefined {
    const email = directPayeeEmail.trim();
    return directPayeeOfferId && email ? { offerId: directPayeeOfferId, email } : undefined;
  }

  function addPreference(tag: string) {
    const current = preferences.split(",").map((item) => item.trim()).filter(Boolean);
    if (current.includes(tag)) return;
    setPreferences([...current, tag].join(", "));
  }

  function appendToolCall(setter: typeof setProcess, tool: string, label: string) {
    setter((prev) => [...prev, { kind: "step", tool, label }]);
  }

  function appendToolResult(setter: typeof setProcess, tool: string, summary: string) {
    setter((prev) => {
      const lastPendingIndex = prev.findLastIndex(
        (entry) => entry.kind === "step" && entry.tool === tool && entry.summary === undefined,
      );
      if (lastPendingIndex === -1) return prev;
      const pending = prev[lastPendingIndex] as Extract<ProcessEntry, { kind: "step" }>;
      const next = [...prev];
      next[lastPendingIndex] = { ...pending, summary };
      return next;
    });
  }

  async function planTrip() {
    setLoading(true);
    setStatus("");
    setProcess([]);
    setPlan(null);
    setQuoteId(null);
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
      if (!response.ok || !response.body) {
        const result: unknown = await response.json().catch(() => null);
        setStatus((result as { error?: string } | null)?.error ?? "Planning failed.");
        return;
      }
      for await (const event of readNdjson<PlanStreamEvent>(response.body)) {
        if (event.kind === "tool-call") appendToolCall(setProcess, event.tool, event.label);
        else if (event.kind === "tool-result") appendToolResult(setProcess, event.tool, event.summary);
        else if (event.kind === "note") setProcess((prev) => [...prev, { kind: "note", text: event.text }]);
        else if (event.kind === "error") setStatus(event.message);
        else if (event.kind === "plan") {
          const parsed = itineraryPlanSchema.safeParse(event.plan);
          if (!parsed.success) {
            setStatus("The planner returned an invalid plan.");
            continue;
          }
          setPlan(parsed.data);
          setQuoteId(event.quoteId ?? null);
          setNote(event.note);
        }
      }
    } catch {
      setStatus("Could not reach the planner.");
    } finally {
      setLoading(false);
    }
  }

  async function startPayment() {
    if (!plan) return;
    setPaymentStatus("");
    setPayment(null);
    setBookingProcess([]);
    setBookingSummary(null);
    if (!quoteId) {
      setPaymentStatus("This plan was not saved on the server, so it can't be paid. Plan the trip again.");
      return;
    }
    try {
      const response = await fetch("/api/payments/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId, demoDirectPayee: demoDirectPayee() }),
      });
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
    if (!payment || !plan) return;
    setPaymentStatus("Confirming payment...");
    setBookingProcess([]);
    setBookingSummary(null);
    setDirectPayments([]);
    setBooking(true);
    try {
      const response = await fetch("/api/payments/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: payment.orderId,
          forceFailureOfferId: simulateFailure ? pickDemoFailureOfferId(plan.offers) : undefined,
        }),
      });
      if (!response.ok || !response.body) {
        const result: unknown = await response.json().catch(() => null);
        setPaymentStatus((result as { error?: string } | null)?.error ?? "Payment failed.");
        return;
      }
      for await (const event of readNdjson<CaptureStreamEvent>(response.body)) {
        if (event.kind === "tool-call") appendToolCall(setBookingProcess, event.tool, event.label);
        else if (event.kind === "tool-result") appendToolResult(setBookingProcess, event.tool, event.summary);
        else if (event.kind === "note") setBookingProcess((prev) => [...prev, { kind: "note", text: event.text }]);
        else if (event.kind === "payment") setPaymentStatus(`Payment ${event.status.toLowerCase()}.`);
        else if (event.kind === "direct-payment") setDirectPayments((prev) => [...prev, event]);
        else if (event.kind === "refund") {
          setBookingProcess((prev) => [
            ...prev,
            { kind: "note", text: `Refunded ${money.format(event.amountMinorUnits / 100)} — that item couldn't be booked.` },
          ]);
        } else if (event.kind === "summary") setBookingSummary(event);
        else if (event.kind === "error") setPaymentStatus(event.message);
      }
    } catch {
      setPaymentStatus("Could not confirm payment.");
    } finally {
      setBooking(false);
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
          <span aria-hidden="true">●</span>Sandbox PayPal · one payment, agent books each item (simulated)
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

            {!loading && process.length === 0 && !plan && (
              <p className="panel-copy" style={{ marginTop: 12 }}>
                No plan yet. Fill in the trip brief and select &ldquo;Plan my trip&rdquo; to see offers, a
                day-by-day schedule, and a budget breakdown here.
              </p>
            )}

            {process.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <p className="section-kicker">Agent process</p>
                <ol className="process-list">
                  {process.map((entry, index) =>
                    entry.kind === "note" ? (
                      <li key={index} className="process-note">
                        &ldquo;{entry.text}&rdquo;
                      </li>
                    ) : (
                      <li
                        key={index}
                        className={entry.summary ? "process-step" : "process-step process-step-active"}
                      >
                        <span className="process-dot" aria-hidden="true" />
                        <span>
                          {entry.label}
                          {entry.summary && <span className="process-summary">{entry.summary}</span>}
                        </span>
                      </li>
                    ),
                  )}
                </ol>
              </div>
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
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <input
                        type="checkbox"
                        checked={simulateFailure}
                        onChange={(event) => setSimulateFailure(event.target.checked)}
                      />
                      Simulate a failed booking (demo)
                    </label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                      <span>Pay one offer&apos;s supplier directly (PayPal email, demo):</span>
                      <select
                        value={directPayeeOfferId}
                        onChange={(event) => setDirectPayeeOfferId(event.target.value)}
                      >
                        <option value="">— none —</option>
                        {/* Never flights: airline ticketing settles via IATA's Billing and Settlement
                            Plan, not through any buyer-side payment processor — see GLOSSARY.md's
                            Supplier Booking entry. A flight is never a legitimate direct-payee target. */}
                        {plan.offers
                          .filter((offer) => offer.productKind !== "flight")
                          .map((offer) => (
                            <option key={offer.id} value={offer.id}>
                              {offer.title}
                            </option>
                          ))}
                      </select>
                      <input
                        type="email"
                        value={directPayeeEmail}
                        onChange={(event) => setDirectPayeeEmail(event.target.value)}
                        placeholder="sb-supplier@personal.example.com"
                        style={{ minWidth: 220 }}
                      />
                    </div>
                    <button type="button" className="guidance-button" onClick={startPayment}>
                      Pay {money.format(plan.totalCostMinorUnits / 100)} and book
                      <span aria-hidden="true">→</span>
                    </button>
                    <p className="payment-note">
                      One PayPal payment covers the full itinerary; Tripweave is the seller. Its agent then
                      books each item separately below — booking is simulated in this demo, since real
                      supplier order creation (Duffel, Booking.com) is gated behind partner approval we
                      don&apos;t have yet.
                    </p>
                  </div>
                )}

                {payment && (
                  <div style={{ marginTop: 12 }}>
                    <a href={payment.approveUrl} target="_blank" rel="noreferrer" className="approve-link">
                      Open PayPal approval →
                    </a>
                    <div>
                      <button type="button" className="secondary-button" onClick={confirmPayment} disabled={booking}>
                        {booking ? "Booking…" : "Confirm payment & book"}
                      </button>
                    </div>
                  </div>
                )}
                {paymentStatus && (
                  <p className="inline-status" role="status" style={{ marginTop: 8 }}>
                    {paymentStatus}
                  </p>
                )}

                {directPayments.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <p className="section-kicker">Paid directly to supplier — real money, not simulated</p>
                    <ul className="budget-list">
                      {directPayments.map((event) => (
                        <li key={event.offerId} className="budget-row">
                          <span>{event.offerId}</span>
                          <span>
                            {money.format(event.amountMinorUnits / 100)} — {event.status}
                            {event.reason ? ` (${event.reason})` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {bookingProcess.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <p className="section-kicker">Booking process</p>
                    <ol className="process-list">
                      {bookingProcess.map((entry, index) =>
                        entry.kind === "note" ? (
                          <li key={index} className="process-note">
                            &ldquo;{entry.text}&rdquo;
                          </li>
                        ) : (
                          <li
                            key={index}
                            className={entry.summary ? "process-step" : "process-step process-step-active"}
                          >
                            <span className="process-dot" aria-hidden="true" />
                            <span>
                              {entry.label}
                              {entry.summary && <span className="process-summary">{entry.summary}</span>}
                            </span>
                          </li>
                        ),
                      )}
                    </ol>
                  </div>
                )}

                {bookingSummary && (
                  <div style={{ marginTop: 16 }}>
                    <p className="section-kicker">Booking result</p>
                    <p className="ai-explanation">
                      <span>AI</span> {bookingSummary.note}
                    </p>
                    <ul className="budget-list">
                      {bookingSummary.results.map((result) => (
                        <li key={result.offerId} className="budget-row">
                          <span>{result.offerId}</span>
                          <span>
                            {result.status === "booked" ? "Booked" : `Failed — ${result.reason}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="panel-copy">
                      {money.format(bookingSummary.bookedMinorUnits / 100)} booked ·{" "}
                      {money.format(bookingSummary.refundedMinorUnits / 100)} refunded
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="page-footer">
          <p>
            Prices and availability are synthetic except live flight fares. Bookings made after payment are
            simulated — real supplier order creation needs partner access this demo doesn&apos;t have yet.
          </p>
          <span>TRIPWEAVE · DEMO</span>
        </div>
      </main>
    </div>
  );
}
