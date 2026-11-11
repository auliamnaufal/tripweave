import type { CSSProperties, ReactNode } from "react";
import "./skeleton.css";

type Size = number | string;

/** One shimmering block. Sizes are px when numbers, any CSS length when strings. */
export function Sk({ w, h, r, className = "", style }: { w?: Size; h?: Size; r?: Size; className?: string; style?: CSSProperties }) {
  return <span className={`sk ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

/** A line of text: shorter last lines read as a paragraph, not a bar chart. */
export function SkLines({ lines = 2, last = "60%", dark = false, h = 14 }: { lines?: number; last?: Size; dark?: boolean; h?: number }) {
  return (
    <span className="sk-stack" style={{ gap: Math.round(h * 0.6) }} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Sk key={i} className={`sk-text ${dark ? "sk-dark" : ""}`} w={i === lines - 1 ? last : "100%"} h={h} />
      ))}
    </span>
  );
}

/**
 * Wraps a skeleton so assistive tech hears one "Loading" instead of a pile of empty shapes.
 * `className` is the page's own root class, so the page's CSS lays the skeleton out.
 */
export function Loading({ className, label = "Loading", children }: { className?: string; label?: string; children: ReactNode }) {
  return (
    <div className={className} aria-busy="true">
      <p className="sr-only" role="status">
        {label}…
      </p>
      {children}
    </div>
  );
}

/** The sticky page header inside the shell: a back link on the left, chips on the right. */
function TopbarSk({ back = 110, chips = 0 }: { back?: number; chips?: number }) {
  return (
    <header className="app-topbar">
      <div className="app-topbar-inner">
        <div className="app-topbar-left">
          {back > 0 && <Sk w={back} h={20} />}
        </div>
        <div className="app-topbar-right">
          {Array.from({ length: chips }, (_, i) => (
            <Sk key={i} w={82} h={34} className="sk-round" />
          ))}
        </div>
      </div>
    </header>
  );
}

/* ---------- Trip ---------- */

export function TripItemSk() {
  return (
    <div className="sk-trip-item">
      <Sk w={44} h={44} r={12} />
      <span className="sk-stack" style={{ gap: 8 }}>
        <Sk className="sk-text" w="55%" h={16} />
        <Sk className="sk-text" w="35%" h={12} />
      </span>
      <Sk w={56} h={14} />
    </div>
  );
}

export function TripSkeleton() {
  return (
    <Loading className="trip-page" label="Loading your trip">
      <TopbarSk back={122} chips={2} />
      <section className="trip-hero sk-trip-hero">
        <div className="trip-hero-copy app-wrap">
          <Sk className="sk-round" w={170} h={22} />
          <Sk w="min(620px, 80%)" h="clamp(56px, 8vw, 104px)" r={14} />
          <span className="sk-row" style={{ gap: 20, flexWrap: "wrap" }}>
            {[140, 100, 100, 150].map((w, i) => (
              <Sk key={i} className="sk-text" w={w} h={18} />
            ))}
          </span>
        </div>
      </section>
      <nav className="trip-subnav" aria-hidden="true">
        <div className="app-wrap trip-subnav-inner">
          {[84, 70, 56, 74].map((w, i) => (
            <Sk key={i} className="sk-round" w={w} h={36} />
          ))}
          <Sk w={94} h={22} style={{ marginLeft: "auto" }} />
        </div>
      </nav>
      <div className="app-wrap trip-grid">
        <div className="trip-main">
          <section className="trip-section">
            <Sk w="min(320px, 70%)" h={44} r={10} />
            <div className="sk-trip-days">
              {[0, 1, 2].map((d) => (
                <div key={d} className="sk-card">
                  <Sk className="sk-text" w={90} h={12} />
                  <Sk w="60%" h={28} />
                  <TripItemSk />
                  <TripItemSk />
                  <TripItemSk />
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="trip-side">
          <div className="trip-summary sk-stack" style={{ gap: 16 }}>
            <Sk className="sk-text" w={76} h={12} />
            <Sk w={180} h={52} r={10} />
            <Sk className="sk-round" w="100%" h={10} />
            <Sk className="sk-text" w="70%" />
            <span className="sk-stack" style={{ gap: 12, marginTop: 6 }}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="sk-row" style={{ justifyContent: "space-between" }}>
                  <Sk className="sk-text" w="40%" />
                  <Sk className="sk-text" w={64} />
                </span>
              ))}
            </span>
            <Sk className="sk-round" w="100%" h={54} style={{ marginTop: 6 }} />
            <SkLines lines={2} last="75%" h={12} />
          </div>
        </aside>
      </div>
    </Loading>
  );
}

/** A suggestion card while the rebooking agent searches. Same shape as `.trip-rebook-list li`. */
export function RebookSuggestionsSk({ count = 2 }: { count?: number }) {
  return (
    <ul className="trip-rebook-list" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} style={{ borderStyle: "solid", borderColor: "var(--line)" }}>
          <Sk className="sk-text" w="45%" h={11} />
          <Sk className="sk-text" w="80%" h={16} />
          <Sk className="sk-text" w="95%" h={12} />
          <Sk className="sk-text" w="65%" h={12} />
        </li>
      ))}
    </ul>
  );
}

/* ---------- Checkout ---------- */

function CheckoutCardSk({ rows }: { rows: number }) {
  return (
    <section className="co-card sk-stack" style={{ gap: 16 }}>
      <Sk className="sk-text" w={160} h={18} />
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="sk-row">
          <Sk w={36} h={36} r={10} />
          <Sk className="sk-text" w="50%" />
          <Sk className="sk-text" w={64} style={{ marginLeft: "auto" }} />
        </span>
      ))}
    </section>
  );
}

export function CheckoutSkeleton() {
  return (
    <Loading className="co-page" label="Loading checkout">
      <div className="co-page-body">
        <TopbarSk back={122} />
        <div className="app-wrap">
          <div className="co-steps sk-row" style={{ gap: 28 }} aria-hidden="true">
            <Sk w={123} h={26} className="sk-round" />
            <Sk w={123} h={26} className="sk-round" />
            <Sk w={89} h={26} className="sk-round" />
          </div>
          <div className="co-grid">
            <div className="co-col">
              <span className="sk-stack" style={{ gap: 12 }}>
                <Sk w="85%" h={56} r={12} />
                <Sk w="45%" h={56} r={12} />
              </span>
              <div className="co-trip">
                <Sk w={92} h={70} r={12} />
                <span className="sk-stack" style={{ flex: 1, gap: 8 }}>
                  <Sk className="sk-text" w="55%" h={16} />
                  <Sk className="sk-text" w="35%" />
                </span>
              </div>
              <section className="co-card sk-stack" style={{ gap: 16 }}>
                <Sk className="sk-text" w={110} h={18} />
                <span className="sk-row" style={{ gap: 12 }}>
                  <Sk w="50%" h={48} r={12} />
                  <Sk w="50%" h={48} r={12} />
                </span>
                <Sk w="100%" h={48} r={12} />
              </section>
              <CheckoutCardSk rows={2} />
              <CheckoutCardSk rows={4} />
            </div>
            <aside className="co-col co-side">
              <div className="co-pay sk-stack" style={{ gap: 16 }}>
                <Sk className="sk-dark sk-text" w={90} h={12} />
                <Sk className="sk-dark" w={210} h={64} r={12} />
                <Sk className="sk-dark sk-round" w="100%" h={10} />
                <Sk className="sk-dark sk-text" w="70%" />
                <span className="sk-stack" style={{ gap: 12, marginTop: 6 }}>
                  {[0, 1, 2].map((i) => (
                    <Sk key={i} className="sk-dark sk-text" w={`${85 - i * 12}%`} />
                  ))}
                </span>
                <Sk className="sk-dark sk-round" w="100%" h={54} style={{ marginTop: 8 }} />
                <SkLines lines={2} last="70%" dark h={12} />
              </div>
            </aside>
          </div>
        </div>
      </div>
    </Loading>
  );
}

/* ---------- Booked ---------- */

export function BookedSkeleton() {
  return (
    <Loading className="bk-page" label="Loading your booking">
      <TopbarSk back={0} />
      <div className="app-wrap bk-grid">
        <section className="bk-left sk-stack" style={{ gap: 18 }}>
          <Sk w={48} h={48} className="sk-round" />
          <span className="sk-stack" style={{ gap: 12 }}>
            <Sk w="80%" h={56} r={12} />
            <Sk w="50%" h={56} r={12} />
          </span>
          <SkLines lines={2} last="55%" h={16} />
          <Sk w="100%" h={56} r={14} style={{ marginTop: 8 }} />
          <span className="sk-stack" style={{ gap: 8 }}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="sk-card sk-row" style={{ padding: 14, gap: 14, borderRadius: 14 }}>
                <Sk w={36} h={36} r={10} />
                <span className="sk-stack" style={{ flex: 1, gap: 6 }}>
                  <Sk className="sk-text" w="55%" />
                  <Sk className="sk-text" w="30%" h={11} />
                </span>
                <Sk w={72} h={24} className="sk-round" />
              </span>
            ))}
          </span>
        </section>
        <aside className="bk-right">
          <div className="sk-card" style={{ padding: 0, overflow: "hidden", gap: 0, borderRadius: 24 }}>
            <Sk w="100%" h={200} r={0} />
            <span className="sk-stack" style={{ gap: 16, padding: 24 }}>
              <span className="sk-row" style={{ justifyContent: "space-between" }}>
                <Sk w={70} h={34} />
                <Sk w={40} h={14} />
                <Sk w={70} h={34} />
              </span>
              {[0, 1, 2].map((i) => (
                <span key={i} className="sk-row" style={{ justifyContent: "space-between" }}>
                  <Sk className="sk-text" w="30%" h={12} />
                  <Sk className="sk-text" w="40%" h={12} />
                </span>
              ))}
              <Sk w="100%" h={56} r={10} style={{ marginTop: 8 }} />
            </span>
          </div>
        </aside>
      </div>
    </Loading>
  );
}

/* ---------- Tickets ---------- */

export function TicketListSk({ count = 3 }: { count?: number }) {
  return (
    <div className="tk-list" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="sk-tk">
          <div className="sk-tk-main">
            <span className="sk-row">
              <Sk w={28} h={28} r={8} />
              <Sk className="sk-text" w={80} h={12} />
              <Sk className="sk-round" w={70} h={22} style={{ marginLeft: "auto" }} />
            </span>
            <Sk className="sk-text" w="60%" h={22} />
            <Sk className="sk-text" w="40%" />
            <span className="sk-row" style={{ gap: 24, marginTop: 8, flexWrap: "wrap" }}>
              {[0, 1, 2].map((j) => (
                <span key={j} className="sk-stack" style={{ gap: 6 }}>
                  <Sk className="sk-text" w={60} h={10} />
                  <Sk className="sk-text" w={96} />
                </span>
              ))}
            </span>
          </div>
          <div className="sk-tk-stub">
            <Sk w={120} h={120} r={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TicketsSkeleton() {
  return (
    <Loading className="tk-page" label="Loading your tickets">
      <TopbarSk back={94} />
      <main className="app-wrap tk-wrap">
        <header className="tk-pagehead sk-stack" style={{ gap: 10 }}>
          <Sk className="sk-text" w={70} h={12} />
          <Sk w="min(380px, 80%)" h={40} r={10} />
          <Sk className="sk-text" w="min(340px, 70%)" />
        </header>
        <TicketListSk />
      </main>
    </Loading>
  );
}

/* ---------- Insights ---------- */

/** The dashboard area alone: also shown while the AG Studio bundle downloads. */
export function InsightsCanvasSk() {
  return (
    <div className="sk-ti-canvas" style={{ height: "100%" }} aria-hidden="true">
      <div className="sk-ti-kpis">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="sk-card" style={{ gap: 10, padding: 16, borderRadius: 16 }}>
            <Sk className="sk-text" w="50%" h={12} />
            <Sk w="70%" h={30} />
          </span>
        ))}
      </div>
      <div className="sk-ti-charts">
        <Sk w="100%" h="100%" r={16} />
        <Sk w="100%" h="100%" r={16} />
      </div>
      <Sk w="100%" h="100%" r={16} />
    </div>
  );
}

export function InsightsSkeleton() {
  return (
    <Loading className="ti-page" label="Loading trip spend">
      <TopbarSk back={110} />
      <main className="ti-wrap">
        <header className="ti-head">
          <div className="sk-stack" style={{ gap: 14, flex: "1 1 520px" }}>
            <Sk className="sk-text" w={80} h={14} />
            <Sk w="min(560px, 90%)" h={44} r={10} />
            <SkLines lines={2} last="45%" h={16} />
          </div>
          <span className="sk-row">
            <Sk className="sk-round" w={64} h={34} />
            <Sk className="sk-round" w={128} h={34} />
          </span>
        </header>
        <div className="ti-canvas">
          <InsightsCanvasSk />
        </div>
      </main>
    </Loading>
  );
}

/* ---------- Account ---------- */

export function AccountSkeleton() {
  return (
    <Loading className="ac-page" label="Loading your account">
      <TopbarSk back={90} />
      <div className="app-wrap">
        <header className="ac-head">
          <span className="sk-row" style={{ gap: 18, flex: "1 1 680px" }}>
            <Sk w={76} h={76} className="sk-round" />
            <span className="sk-stack" style={{ flex: 1, gap: 10 }}>
              <Sk w="min(260px, 80%)" h={30} />
              <Sk className="sk-text" w="min(200px, 60%)" />
            </span>
          </span>
          <span className="sk-row" style={{ gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <Sk key={i} w={104} h={78} r={16} />
            ))}
          </span>
        </header>
        <div className="ac-tabs" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Sk key={i} h={42} r={10} style={{ flex: 1, minWidth: 96, background: i === 0 ? "var(--surface)" : undefined }} />
          ))}
        </div>
        <section className="ac-panel sk-stack" style={{ gap: 14 }}>
          <Sk w={160} h={26} />
          {[0, 1].map((i) => (
            <div key={i} className="sk-ac-trip">
              <Sk />
              <div className="sk-ac-trip-body">
                <Sk className="sk-round" w={90} h={22} />
                <Sk w="50%" h={26} />
                <SkLines lines={2} last="40%" />
                <span className="sk-row" style={{ marginTop: 12 }}>
                  <Sk className="sk-round" w={120} h={40} />
                  <Sk className="sk-round" w={100} h={40} />
                </span>
              </div>
            </div>
          ))}
        </section>
      </div>
    </Loading>
  );
}

/* ---------- Gear ---------- */

/** Product rows in the gear panel while the agent searches stores. */
export function GearProductsSk({ count = 3 }: { count?: number }) {
  return (
    <ul className="gear-products" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <span className="gear-product" style={{ pointerEvents: "none" }}>
            <Sk w={56} h={56} r={8} />
            <span className="sk-stack" style={{ gap: 8 }}>
              <Sk className="sk-text" w="90%" h={12} />
              <Sk className="sk-text" w="50%" h={12} />
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function GearKitSk() {
  return (
    <ul className="gear-needs" aria-hidden="true">
      {[0, 1].map((i) => (
        <li key={i} className="gear-need" style={{ gap: 10 }}>
          <Sk className="sk-text" w={140} h={16} />
          <Sk className="sk-text" w="70%" h={12} />
          <GearProductsSk />
        </li>
      ))}
    </ul>
  );
}
