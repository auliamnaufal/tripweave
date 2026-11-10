import type { KeyboardEvent } from "react";

/** Arrow/Home/End navigation for a role="tablist" (WAI-ARIA tabs pattern, automatic activation). */
export function tabKeys<T extends string>(e: KeyboardEvent<HTMLElement>, ids: readonly T[], current: T, select: (id: T) => void) {
  const i = ids.indexOf(current);
  const next =
    e.key === "ArrowRight" ? ids[(i + 1) % ids.length]
    : e.key === "ArrowLeft" ? ids[(i - 1 + ids.length) % ids.length]
    : e.key === "Home" ? ids[0]
    : e.key === "End" ? ids[ids.length - 1]
    : null;
  if (!next) return;
  e.preventDefault();
  select(next);
  const list = e.currentTarget.closest('[role="tablist"]');
  list?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus();
}
