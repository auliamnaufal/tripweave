"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppTopbar } from "@/components/app/AppTopbar";
import { DocumentsPanel } from "@/components/app/TravelDocs";
import { Icon, type IconName } from "@/components/brand/Icon";
import { usd } from "@/features/ui-mock/data";
import { destinations, getDestination } from "@/features/ui-mock/destinations";
import { tabKeys } from "@/components/app/tabKeys";
import { mergeTripRows, type Order } from "@/features/ui-mock/tripStore";
import {
  historyStore,
  ordersStore,
  savedStore,
  useHistory,
  useHydrated,
  useOrders,
  useSaved,
  useTripPrefs,
  useUser,
  userStore,
} from "@/features/ui-mock/tripStore";
import { AirportPicker } from "@/components/app/AirportPicker";
import { toggleSaved } from "@/features/db/sync";
import { useSignOut } from "@/components/app/AccountMenu";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { AccountSkeleton } from "@/components/app/Skeleton";

type Tab = "trips" | "saved" | "documents" | "preferences" | "payments" | "settings";
const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: "trips", label: "Trips", icon: "ticket" },
  { id: "saved", label: "Saved", icon: "heart" },
  { id: "documents", label: "Documents", icon: "passport" },
  { id: "preferences", label: "Preferences", icon: "sliders" },
  { id: "payments", label: "Payments", icon: "wallet" },
  { id: "settings", label: "Settings", icon: "user" },
];

const styles = ["Slow mornings", "Food first", "Big hikes", "Beaches", "Culture", "Nightlife", "Design hotels", "Off the beaten path"];
const diets = ["No restrictions", "Vegetarian", "Vegan", "Pescatarian", "Gluten-free", "Halal"];

export function Account() {
  const hydrated = useHydrated();
  const user = useUser();
  if (!hydrated) return <AccountSkeleton />;
  if (!user) {
    return (
      <div className="ac-page">
        <AppTopbar />
        <div className="ac-gate">
          <span className="ac-gate-icon">
            <Icon name="user" size={22} />
          </span>
          <h1>Sign in to see your account</h1>
          <p>Your trips, receipts and travel preferences live here.</p>
          <Link href="/login?next=/account" className="btn btn-ember">
            Sign in
            <span className="btn-arrow">
              <Icon name="arrow" />
            </span>
          </Link>
        </div>
      </div>
    );
  }
  return <AccountInner user={user} />;
}

function AccountInner({ user }: { user: NonNullable<ReturnType<typeof useUser>> }) {
  const root = useRef<HTMLDivElement>(null);
  const params = useSearchParams();
  const initial = (params.get("tab") as Tab) ?? "trips";
  const [tab, setTab] = useState<Tab>(tabs.some((t) => t.id === initial) ? initial : "trips");
  const prefs = useTripPrefs();
  const history = useHistory();
  const orders = useOrders();
  const saved = useSaved();
  const trips = mergeTripRows(history, orders);
  const [undo, setUndo] = useState<{ label: string; restore: () => void } | null>(null);
  const [picked, setPicked] = useState<string[]>(prefs.vibes.length ? prefs.vibes : ["Slow mornings", "Food first"]);
  const [diet, setDiet] = useState("No restrictions");
  const [seat, setSeat] = useState<"Window" | "Aisle">("Window");
  const [homeAirport, setHomeAirport] = useState(user?.homeAirport ?? "San Francisco (SFO)");
  const [savedNote, setSavedNote] = useState(false);
  const [toggles, setToggles] = useState({ booking: true, price: true, tips: false, newsletter: true });

  const countries = new Set([...orders.map((o) => getDestination(o.destId).country), ...history.map((h) => getDestination(h.destId).country)]);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from(".ac-head > *", { y: 24, opacity: 0, stagger: 0.07, duration: 1, ease: "expo.out" });
      gsap.from(".ac-tabs button", { y: 10, opacity: 0, stagger: 0.04, duration: 0.8, ease: "expo.out", delay: 0.2 });
    },
    { scope: root },
  );
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from(".ac-panel > *", { y: 20, opacity: 0, stagger: 0.05, duration: 0.8, ease: "expo.out" });
    },
    { scope: root, dependencies: [tab] },
  );

  function clearWithUndo<T>(label: string, store: { get: () => T; set: (v: T) => void; clear: () => void }) {
    const before = store.get();
    store.clear();
    setUndo({ label, restore: () => store.set(before) });
  }

  function downloadReceipt(o: Order) {
    const text = [
      "Tripweave receipt (demo)",
      `Order: ${o.id}`,
      `Trip: ${o.title}`,
      `Date: ${new Date(o.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
      `Bookings: ${o.items}`,
      `Total: ${usd.format(o.total)}`,
      "Paid once with PayPal.",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tripweave-receipt-${o.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Same sign-out as the account menu: session and every per-person local cache, then home.
  const { signOut, busy: signingOut } = useSignOut();

  return (
    <div ref={root} className="ac-page">
      <AppTopbar back={{ href: "/plan", label: "Planner" }} />
      <div className="app-wrap">
        <header className="ac-head">
          <div className="ac-id">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={user.avatar} alt="" />
            <div>
              <h1>{user.name}</h1>
              <p>
                {user.email} · Home airport {user.homeAirport} · Member since {user.memberSince}
              </p>
            </div>
          </div>
          <dl className="ac-stats">
            <div>
              <dt>Plans made</dt>
              <dd>{history.length}</dd>
            </div>
            <div>
              <dt>Trips booked</dt>
              <dd>{orders.length}</dd>
            </div>
            <div>
              <dt>Countries</dt>
              <dd>{countries.size}</dd>
            </div>
          </dl>
        </header>

        <div className="ac-tabs" role="tablist" aria-label="Account sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`ac-tab-${t.id}`}
              data-tab={t.id}
              aria-selected={tab === t.id}
              aria-controls="ac-panel"
              tabIndex={tab === t.id ? 0 : -1}
              className={tab === t.id ? "is-active" : ""}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => tabKeys(e, tabs.map((x) => x.id), tab, setTab)}
            >
              <Icon name={t.icon} size={16} />
              {t.label}
            </button>
          ))}
        </div>

        <section className="ac-panel" key={tab} id="ac-panel" role="tabpanel" aria-labelledby={`ac-tab-${tab}`}>
          {undo && (
            <p className="ac-undo" role="status">
              {undo.label}{" "}
              <button
                type="button"
                onClick={() => {
                  undo.restore();
                  setUndo(null);
                }}
              >
                Undo
              </button>
            </p>
          )}
          {tab === "trips" && (
            <>
              <h2 className="ac-h2">Your trips</h2>
              {trips.length === 0 ? (
                <p className="ac-empty">
                  No plans yet. <Link href="/plan">Start one in the planner</Link>.
                </p>
              ) : (
                <div className="ac-trips">
                  {trips.map((t) => {
                    const d = getDestination(t.destId);
                    return (
                      <article key={t.key} className="ac-trip">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={d.card} alt="" />
                        <div className="ac-trip-body">
                          <span className={`ac-status ${t.paid ? "is-booked" : ""}`}>{t.paid ? "Paid" : "Planned, not paid"}</span>
                          <h3>{t.title}</h3>
                          <p>{new Date(t.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                          <div className="ac-trip-foot">
                            {t.total !== null && <b>{usd.format(t.total)}</b>}
                            <div>
                              {t.paid ? (
                                <Link href={`/tickets?order=${encodeURIComponent(t.orderId!)}`} className="btn btn-sm btn-ember">
                                  <Icon name="ticket" size={14} /> Tickets
                                </Link>
                              ) : (
                                <Link href={`/plan?resume=${encodeURIComponent(t.tripId!)}&dest=${encodeURIComponent(t.destId)}`} className="btn btn-sm btn-ghost">
                                  Itinerary
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              {history.length > 0 && (
                <button type="button" className="ac-link" onClick={() => clearWithUndo("Recent plans cleared.", historyStore)}>
                  Clear recent plans
                </button>
              )}
            </>
          )}

          {tab === "saved" && (
            <>
              <h2 className="ac-h2">Saved places</h2>
              <div className="ac-grid ac-grid-lg">
                {destinations.map((d) => {
                  const on = saved.includes(d.id);
                  return (
                    <article key={d.id} className={`ac-place ${on ? "is-on" : ""}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={d.card} alt="" />
                      <button
                        type="button"
                        className="ac-heart"
                        aria-pressed={on}
                        aria-label={on ? `Remove ${d.name}` : `Save ${d.name}`}
                        onClick={() => {
                          savedStore.set(on ? saved.filter((x) => x !== d.id) : [...saved, d.id]);
                          toggleSaved(d.id, !on);
                        }}
                      >
                        <Icon name="heart" size={16} />
                      </button>
                      <div>
                        <b>{d.name}</b>
                        <small>{d.country}</small>
                        <Link href={`/plan?q=${encodeURIComponent(d.name)}`}>Plan this</Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {tab === "documents" && <DocumentsPanel prefs={prefs} />}

          {tab === "preferences" && (
            <form
              className="ac-form"
              onSubmit={(e) => {
                e.preventDefault();
                // Saved for real: the planner flies from here unless a request names another origin.
                if (user && homeAirport.trim()) userStore.set({ ...user, homeAirport: homeAirport.trim() });
                setSavedNote(true);
                setTimeout(() => setSavedNote(false), 2200);
              }}
            >
              <div className="ac-field">
                <h2 className="ac-h2">How you like to travel</h2>
                <p>The agent starts every plan from these.</p>
                <div className="ac-chips">
                  {styles.map((s) => (
                    <button key={s} type="button" aria-pressed={picked.includes(s)} className={picked.includes(s) ? "is-on" : ""} onClick={() => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))}>
                      {picked.includes(s) && <Icon name="check" size={12} />}
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ac-row">
                <label className="ac-input">
                  <span>Home airport</span>
                  <AirportPicker name="home-airport" value={homeAirport} onChange={setHomeAirport} />
                </label>
                <label className="ac-input">
                  <span>Usual budget per trip</span>
                  <input defaultValue="$3,000" />
                </label>
              </div>
              <div className="ac-field">
                <h2 className="ac-h2">Seat</h2>
                <div className="ac-seg">
                  {(["Window", "Aisle"] as const).map((s) => (
                    <button key={s} type="button" aria-pressed={seat === s} className={seat === s ? "is-on" : ""} onClick={() => setSeat(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ac-field">
                <h2 className="ac-h2">Food</h2>
                <div className="ac-chips">
                  {diets.map((d) => (
                    <button key={d} type="button" aria-pressed={diet === d} className={diet === d ? "is-on" : ""} onClick={() => setDiet(d)}>
                      {diet === d && <Icon name="check" size={12} />}
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ac-actions">
                <button type="submit" className="btn">
                  Save preferences
                </button>
                <span className="ac-saved" role="status">
                  {savedNote && (
                    <>
                      <Icon name="check" size={14} /> Preferences saved
                    </>
                  )}
                </span>
              </div>
            </form>
          )}

          {tab === "payments" && (
            <>
              <div className="ac-callout">
                <span className="ac-callout-icon">
                  <Icon name="shield" size={20} />
                </span>
                <div>
                  <b>No card or wallet is stored</b>
                  <p>Every trip is one PayPal approval for the exact total. After that, Tripweave keeps only the receipt.</p>
                </div>
              </div>
              <h2 className="ac-h2">Receipts</h2>
              {orders.length === 0 ? (
                <p className="ac-empty">
                  No payments yet. When you pay for a plan, its receipt shows up here.
                </p>
              ) : (
                <table className="ac-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Trip</th>
                      <th>Date</th>
                      <th>Bookings</th>
                      <th>Total</th>
                      <th aria-label="Tickets and receipt" />
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td className="ac-mono">{o.id}</td>
                        <td>{o.title}</td>
                        <td>{new Date(o.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                        <td>{o.items}</td>
                        <td className="ac-mono">{usd.format(o.total)}</td>
                        <td className="ac-table-actions">
                          <Link href={`/tickets?order=${encodeURIComponent(o.id)}`} className="ac-icon-btn" aria-label={`Tickets for ${o.id}`}>
                            <Icon name="ticket" size={16} />
                          </Link>
                          <button type="button" className="ac-icon-btn" aria-label={`Download receipt for ${o.id}`} onClick={() => downloadReceipt(o)}>
                            <Icon name="download" size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {orders.length > 0 && (
                <button type="button" className="ac-link" onClick={() => clearWithUndo("Demo receipts cleared.", ordersStore)}>
                  Clear demo receipts
                </button>
              )}
            </>
          )}

          {tab === "settings" && (
            <div className="ac-form">
              <div className="ac-field">
                <h2 className="ac-h2">Notifications</h2>
                {(
                  [
                    ["booking", "Booking updates", "Each confirmation as the agent books it"],
                    ["price", "Price drops", "If a flight in a saved plan gets cheaper"],
                    ["tips", "Before-you-go tips", "Weather, visas and packing, 3 days ahead"],
                    ["newsletter", "Field notes", "One email a month: a place, a plan, what it cost"],
                  ] as const
                ).map(([key, title, sub]) => (
                  <label key={key} className="ac-toggle">
                    <span>
                      <b>{title}</b>
                      <small>{sub}</small>
                    </span>
                    <input type="checkbox" checked={toggles[key]} onChange={() => setToggles((t) => ({ ...t, [key]: !t[key] }))} />
                    <i aria-hidden="true" />
                  </label>
                ))}
              </div>
              <div className="ac-row">
                <label className="ac-input">
                  <span>Currency</span>
                  <select defaultValue="USD">
                    <option>USD</option>
                    <option>EUR</option>
                    <option>IDR</option>
                    <option>SGD</option>
                  </select>
                </label>
                <label className="ac-input">
                  <span>Language</span>
                  <select defaultValue="English">
                    <option>English</option>
                    <option>Bahasa Indonesia</option>
                  </select>
                </label>
              </div>
              <div className="ac-actions">
                <button type="button" className="btn btn-ghost" onClick={() => void signOut()} disabled={signingOut}>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
