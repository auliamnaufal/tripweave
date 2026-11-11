"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoMark } from "@/components/brand/Logo";
import { Icon, type IconName } from "@/components/brand/Icon";
import { AccountMenu } from "@/components/app/AccountMenu";
import { getDestination } from "@/features/ui-mock/destinations";
import { useHistory } from "@/features/ui-mock/tripStore";
import "./planner.css";
import "./account-menu.css";

const NAV: { icon: IconName; label: string; href: string; match: (path: string, tab: string | null) => boolean }[] = [
  { icon: "chat", label: "Planner", href: "/plan", match: (p) => p === "/plan" },
  { icon: "map", label: "Current trip", href: "/trip", match: (p) => p === "/trip" || p === "/checkout" || p === "/booked" },
  { icon: "ticket", label: "E-tickets", href: "/tickets", match: (p) => p === "/tickets" },
  { icon: "wallet", label: "Trip spend", href: "/insights", match: (p) => p === "/insights" },
  { icon: "calendar", label: "My trips", href: "/account?tab=trips", match: (p, t) => p === "/account" && t === "trips" },
  { icon: "heart", label: "Saved places", href: "/account?tab=saved", match: (p, t) => p === "/account" && t === "saved" },
  { icon: "passport", label: "Travel documents", href: "/account?tab=documents", match: (p, t) => p === "/account" && t === "documents" },
  { icon: "user", label: "Account", href: "/account", match: (p, t) => p === "/account" && (!t || !["trips", "saved", "documents"].includes(t)) },
];

// One collapsed/expanded state for the whole app, so the sidebar looks the
// same on every page instead of resetting as you move around.
const KEY = "tw-side-collapsed";
const listeners = new Set<() => void>();
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
export function setSidebarCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    /* storage blocked: state still applies for this page */
  }
  listeners.forEach((listener) => listener());
}
export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    readCollapsed,
    () => false,
  );
}

/**
 * The app's one sidebar: logo, New trip, where everything lives, recent plans
 * and the account menu (with Sign out). The planner and every other app page
 * render this same component, so it never changes shape between pages.
 */
export function AppSidebar({
  onNewTrip,
  onRecent,
  busy = false,
  onNavigate,
  drawer = false,
}: {
  /** The planner resets in place; elsewhere New trip opens a fresh planner. */
  onNewTrip?: () => void;
  /** On the planner page this resumes trip `id` for real; elsewhere there's no handler, so `recent()` falls back to a fresh `/plan?q=` navigation keyed on destId. */
  onRecent?: (tripId: string, destId: string) => void;
  busy?: boolean;
  /** Called after any link is followed (the mobile drawer closes itself). */
  onNavigate?: () => void;
  /** Rendered inside the mobile drawer: always expanded, no collapse toggle. */
  drawer?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const history = useHistory();
  const collapsedStored = useSidebarCollapsed();
  const collapsed = drawer ? false : collapsedStored;
  // The ?tab= of /account, read from the URL (useSearchParams would force every page dynamic).
  const tab = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("tab"),
    () => null,
  );

  function newTrip() {
    onNavigate?.();
    if (onNewTrip) onNewTrip();
    else router.push("/plan");
  }

  function recent(h: { id: string; destId: string }) {
    onNavigate?.();
    if (onRecent) onRecent(h.id, h.destId);
    else router.push(`/plan?q=${encodeURIComponent(getDestination(h.destId).name)}`);
  }

  return (
    <div className={`app-side ${collapsed ? "is-collapsed" : ""}`}>
      <div className="pl-side-top">
        <Link href="/plan" className="logo pl-logo" aria-label="Tripweave planner" onClick={onNavigate}>
          <LogoMark />
          <span>Tripweave</span>
        </Link>
        {!drawer && (
          <button type="button" className="pl-collapse" onClick={() => setSidebarCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>
            <Icon name="chevron" size={16} />
          </button>
        )}
      </div>
      <button type="button" className="pl-new" onClick={newTrip} data-tip="New trip" disabled={busy}>
        <Icon name="plus" size={16} />
        <span>New trip</span>
      </button>
      <nav className="pl-nav" aria-label="App">
        {NAV.map((item) => {
          const active = item.match(pathname, tab);
          return (
            <Link key={item.label} href={item.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined} data-tip={item.label} onClick={onNavigate}>
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="pl-recent">
        <p className="pl-label">Recent plans</p>
        {history.length === 0 ? (
          <p className="pl-recent-empty">No trips yet. Plans you make show up here.</p>
        ) : (
          history.map((h) => (
            <button key={h.id} type="button" onClick={() => !busy && recent(h)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={getDestination(h.destId).card} alt="" width={26} height={26} />
              <span>{h.title}</span>
            </button>
          ))
        )}
      </div>
      <div className="app-side-account">
        <AccountMenu variant="sidebar" collapsed={collapsed} />
      </div>
    </div>
  );
}

/** The phone version of the same sidebar: a menu button that slides it in. */
export function MobileNav(props: { onNewTrip?: () => void; onRecent?: (tripId: string, destId: string) => void; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);
  return (
    <>
      <button type="button" className="app-menu-btn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
        <Icon name="menu" size={20} />
      </button>
      {open && (
        <div className="app-drawer" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="app-drawer-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="app-drawer-panel pl-side">
            <AppSidebar {...props} drawer onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
