"use client";

import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Icon } from "@/components/brand/Icon";
import { useUser } from "@/features/ui-mock/tripStore";
import { useInShell } from "@/components/app/AppShell";
import { AccountMenu } from "@/components/app/AccountMenu";

export function AppTopbar({ back, children }: { back?: { href: string; label: string }; children?: React.ReactNode }) {
  const user = useUser();
  // Inside the app shell the sidebar already carries the logo and the account menu.
  const inShell = useInShell();
  return (
    <header className="app-topbar">
      <div className="app-topbar-inner">
        <div className="app-topbar-left">
          {/* Signed in, the app is home: the logo never drops you back on the landing page. */}
          {!inShell && <Logo href={user ? "/plan" : "/"} />}
          {back && (
            <Link href={back.href} className="app-back">
              <Icon name="arrow-left" size={16} />
              <span>{back.label}</span>
            </Link>
          )}
        </div>
        <div className="app-topbar-right">
          {children}
          {!inShell && <AccountMenu />}
        </div>
      </div>
    </header>
  );
}
