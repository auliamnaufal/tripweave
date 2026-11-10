"use client";

import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Icon } from "@/components/brand/Icon";
import { useUser } from "@/features/ui-mock/tripStore";

export function AppTopbar({ back, children }: { back?: { href: string; label: string }; children?: React.ReactNode }) {
  const user = useUser();
  return (
    <header className="app-topbar">
      <div className="app-topbar-inner">
        <div className="app-topbar-left">
          {/* Signed in, the app is home: the logo never drops you back on the landing page. */}
          <Logo href={user ? "/plan" : "/"} />
          {back && (
            <Link href={back.href} className="app-back">
              <Icon name="arrow-left" size={16} />
              <span>{back.label}</span>
            </Link>
          )}
        </div>
        <div className="app-topbar-right">
          {children}
          {user ? (
            <Link href="/account" className="app-avatar" title={`${user.name} · Account`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={user.avatar} alt="Account" />
            </Link>
          ) : (
            <Link href="/login" className="btn btn-sm btn-ghost">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
