"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { AppSidebar, MobileNav, useSidebarCollapsed } from "@/components/app/AppSidebar";
import { AccountMenu } from "@/components/app/AccountMenu";

const ShellContext = createContext(false);

/** True inside AppShell: page headers then leave the logo and avatar to the sidebar. */
export function useInShell(): boolean {
  return useContext(ShellContext);
}

/**
 * The frame every signed-in page sits in: the same sidebar as the planner on
 * the left (a menu drawer on phones), the page on the right.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed = useSidebarCollapsed();
  return (
    <ShellContext.Provider value>
      <div className={`shell ${collapsed ? "is-collapsed" : ""}`}>
        <aside className="pl-side shell-side" aria-label="Workspace">
          <AppSidebar />
        </aside>
        <div className="shell-main">
          <header className="shell-mobilebar">
            <MobileNav />
            <Link href="/plan" className="logo" aria-label="Tripweave planner">
              <LogoMark />
              <span>Tripweave</span>
            </Link>
            <AccountMenu />
          </header>
          {children}
        </div>
      </div>
    </ShellContext.Provider>
  );
}
