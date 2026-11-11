"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/brand/Icon";
import { signOut } from "@/features/db/sync";
import { useUser } from "@/features/ui-mock/tripStore";
import "./account-menu.css";

const LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: "/plan", label: "Planner", icon: "chat" },
  { href: "/account?tab=trips", label: "My trips", icon: "map" },
  { href: "/tickets", label: "E-tickets", icon: "ticket" },
  { href: "/insights", label: "Trip spend", icon: "wallet" },
  { href: "/account?tab=payments", label: "Receipts", icon: "wallet" },
  { href: "/account", label: "Account settings", icon: "user" },
];

/** Signs out everywhere: the Supabase session and every per-person local cache, then home. */
export function useSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await signOut();
    } finally {
      router.replace("/");
      router.refresh();
    }
  }
  return { signOut: run, busy };
}

/**
 * The avatar button every header shows once signed in: where your things are,
 * and Sign out. Closes on Escape, outside click, or picking an item.
 */
export function AccountMenu({
  tone = "light",
  align = "right",
  showName = false,
  variant = "compact",
  collapsed = false,
}: {
  tone?: "light" | "dark";
  align?: "right" | "left";
  showName?: boolean;
  /** "sidebar": a full-width card at the foot of the sidebar, opening upwards. */
  variant?: "compact" | "sidebar";
  collapsed?: boolean;
}) {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const { signOut: doSignOut, busy } = useSignOut();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) {
    return (
      <Link href="/login" className={`am-signin is-${tone} ${variant === "sidebar" ? "is-sidebar" : ""}`}>
        Sign in
      </Link>
    );
  }

  return (
    <div ref={root} className={`am is-${tone} is-${align} is-${variant} ${collapsed ? "is-collapsed" : ""}`}>
      <button
        type="button"
        className="am-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        data-tip={variant === "sidebar" && collapsed ? user.name : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={user.avatar} alt="" />
        {variant === "sidebar" && !collapsed ? (
          <span className="am-who">
            <b>{user.name}</b>
            <small>{user.email}</small>
          </span>
        ) : (
          showName && <span className="am-name">{user.firstName}</span>
        )}
        {!(variant === "sidebar" && collapsed) && <Icon name="chevron" size={14} />}
        <span className="sr-only">Account menu for {user.name}</span>
      </button>
      {open && (
        <div id={menuId} className="am-menu" role="menu">
          <div className="am-head">
            <b>{user.name}</b>
            <small>{user.email}</small>
          </div>
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} role="menuitem" className="am-item" onClick={() => setOpen(false)}>
              <Icon name={link.icon} size={15} /> {link.label}
            </Link>
          ))}
          <div className="am-sep" role="separator" />
          <button type="button" role="menuitem" className="am-item is-danger" onClick={() => void doSignOut()} disabled={busy}>
            <Icon name="arrow-left" size={15} /> {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
