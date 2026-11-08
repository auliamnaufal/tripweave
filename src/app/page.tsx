"use client";

import { useState } from "react";
import { itineraryPlanSchema, type ItineraryPlanView } from "@/features/planner/travelOffer";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type Payment = { orderId: string; approveUrl: string };

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
      setStatus("Plan ready. Prices and fit checks are calculated by the app.");
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
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>Tripweave</h1>
        <p style={{ color: "#555", margin: "4px 0 0" }}>
          Describe a trip. The agent searches and assembles a plan, and the app checks the numbers.
        </p>
      </header>

      <section style={{ display: "grid", gap: 12, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            Flying from (city)
            <input value={originCity} onChange={(event) => setOriginCity(event.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            Flying from (country)
            <input value={originCountry} onChange={(event) => setOriginCountry(event.target.value)} />
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            City
            <input value={city} onChange={(event) => setCity(event.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            Country
            <input value={country} onChange={(event) => setCountry(event.target.value)} />
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            Start
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            End
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            Travelers
            <input type="number" min={1} value={travelers} onChange={(event) => setTravelers(Number(event.target.value))} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            Budget (USD)
            <input type="number" min={1} value={budget} onChange={(event) => setBudget(Number(event.target.value))} />
          </label>
        </div>
        <label style={{ display: "grid", gap: 4 }}>
          Preferences
          <input value={preferences} onChange={(event) => setPreferences(event.target.value)} placeholder="beach, local food" />
        </label>
        <button
          type="button"
          onClick={planTrip}
          disabled={loading}
          style={{ padding: "10px 16px", cursor: loading ? "default" : "pointer" }}
        >
          {loading ? "Planning..." : "Plan my trip"}
        </button>
        {status && <p style={{ color: status.includes("unavailable") || status.includes("failed") || status.includes("Could not") || status.includes("invalid") ? "#b00020" : "#444", margin: 0 }}>{status}</p>}
      </section>

      {plan && (
        <section style={{ borderTop: "1px solid #ddd", paddingTop: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>Your plan</h2>
            <strong>{money.format(plan.totalCostMinorUnits / 100)}</strong>
          </div>
          <p style={{ margin: "4px 0 12px" }}>
            {plan.status === "feasible" ? "Fits the brief" : "Does not fit the brief"} · {note}
          </p>

          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {plan.offers.map((offer) => (
              <li key={offer.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span>
                    <strong>{offer.title}</strong>{" "}
                    <span style={{ color: "#777", textTransform: "uppercase", fontSize: 12 }}>{offer.productKind}</span>
                  </span>
                  <span>{money.format(offer.costMinorUnits / 100)}</span>
                </div>
                <p style={{ margin: "4px 0 0", color: "#555" }}>{offer.summary}</p>
              </li>
            ))}
          </ul>

          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: "0 0 8px" }}>Day by day</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {plan.days.map((day) => (
                <div key={day.date} style={{ border: "1px solid #eee", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>{day.date}</strong>
                    <span>{money.format(day.subtotalMinorUnits / 100)}</span>
                  </div>
                  {day.offers.length === 0 ? (
                    <p style={{ margin: "4px 0 0", color: "#555" }}>Nothing scheduled</p>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0", display: "grid", gap: 4 }}>
                      {day.offers.map((offer) => (
                        <li key={offer.id} style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>{offer.title}</span>
                          <span>{money.format(offer.costMinorUnits / 100)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: "0 0 8px" }}>Budget breakdown</h3>
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 4 }}>
              {plan.budgetByCategory.map((item) => (
                <li key={item.productKind} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{categoryLabels[item.productKind]}</span>
                  <span>{money.format(item.subtotalMinorUnits / 100)}</span>
                </li>
              ))}
            </ul>
          </div>

          {plan.violations.length > 0 && (
            <p style={{ color: "#b00020" }}>
              {plan.violations.map(violationText).join(" · ")}
            </p>
          )}

          {plan.status === "feasible" && (
            <div style={{ marginTop: 16, borderTop: "1px solid #ddd", paddingTop: 16 }}>
              <button type="button" onClick={startPayment} style={{ padding: "10px 16px" }}>
                Buy this plan for $5
              </button>
              <p style={{ color: "#555", fontSize: 13, margin: "8px 0 0" }}>
                You are buying Tripweave&apos;s itinerary plan, not a hotel or flight booking. Sample offers stay clearly labeled.
              </p>
            </div>
          )}

          {payment && (
            <div style={{ marginTop: 12 }}>
              <a href={payment.approveUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginBottom: 8 }}>
                Open PayPal approval
              </a>
              <div>
                <button type="button" onClick={confirmPayment} style={{ padding: "8px 14px" }}>
                  Confirm payment
                </button>
              </div>
            </div>
          )}
          {paymentStatus && <p style={{ marginTop: 8, color: "#444" }}>{paymentStatus}</p>}
        </section>
      )}

      <footer style={{ marginTop: 32, color: "#777", fontSize: 13 }}>
        Prices, availability, and booking state are synthetic. Nothing is booked or reserved here.
      </footer>
    </main>
  );
}
