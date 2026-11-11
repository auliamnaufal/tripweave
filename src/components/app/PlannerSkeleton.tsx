"use client";

import type { Ref } from "react";
import { AppSidebar, MobileNav, useSidebarCollapsed } from "@/components/app/AppSidebar";
import { Loading, Sk, SkLines } from "@/components/app/Skeleton";
import "./planner.css";

/**
 * The planner while it starts up: the real sidebar (it doesn't depend on the
 * chat), the welcome screen and the empty plan panel as skeletons, so the
 * planner opens in place instead of on a blank page.
 */
export function PlannerSkeleton({ ref }: { ref?: Ref<HTMLDivElement> }) {
  const collapsed = useSidebarCollapsed();
  return (
    <div ref={ref} className={`pl ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="pl-side" aria-label="Workspace">
        <AppSidebar />
      </aside>
      <Loading className="pl-main" label="Loading the planner">
        <header className="pl-mobilebar">
          <MobileNav />
          <Sk w={80} h={16} />
          <Sk className="sk-round" w={68} h={34} />
        </header>
        <div className="pl-thread">
          <div className="pl-welcome">
            <Sk className="sk-text" w={90} h={15} />
            <span className="sk-stack" style={{ gap: 10, marginTop: 14 }}>
              <Sk w="min(520px, 90%)" h={48} r={12} />
            </span>
            <span style={{ display: "block", marginTop: 18 }}>
              <SkLines lines={2} last="70%" h={15} />
            </span>
            <Sk w="100%" h={64} r={18} style={{ marginTop: 28 }} />
            <div className="pl-places">
              {Array.from({ length: 8 }, (_, i) => (
                <Sk key={i} w="100%" h={132} r={16} />
              ))}
            </div>
          </div>
        </div>
      </Loading>
      <aside className="pl-panel" aria-hidden="true">
        <div className="pl-panel-empty">
          <Sk w="100%" h={280} r={16} />
          <Sk w="70%" h={24} style={{ marginTop: 8 }} />
          <SkLines lines={2} last="80%" />
        </div>
      </aside>
    </div>
  );
}

/** The chat thread while a saved trip is fetched: a question, the agent's work, its reply. */
export function ChatSkeleton() {
  return (
    <Loading className="sk-chat" label="Loading your trip">
      <Sk className="sk-chat-user" />
      <div className="sk-chat-agent">
        <Sk w={32} h={32} className="sk-round" />
        <span className="sk-stack" style={{ gap: 12 }}>
          <SkLines lines={3} last="55%" h={15} />
          <Sk w="100%" h={120} r={16} />
        </span>
      </div>
      <Sk className="sk-chat-user" style={{ width: "min(40%, 240px)" }} />
      <div className="sk-chat-agent">
        <Sk w={32} h={32} className="sk-round" />
        <span className="sk-stack" style={{ gap: 12 }}>
          <SkLines lines={2} last="70%" h={15} />
          <span className="sk-row" style={{ gap: 10 }}>
            <Sk w="33%" h={150} r={14} />
            <Sk w="33%" h={150} r={14} />
            <Sk w="33%" h={150} r={14} />
          </span>
        </span>
      </div>
    </Loading>
  );
}
