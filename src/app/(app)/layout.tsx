import { AppShell } from "@/components/app/AppShell";
import "@/components/app/app.css";

/**
 * Every signed-in page except the planner (which draws its own sidebar) sits
 * in this one shell. Being a layout, it stays mounted while you move between
 * these pages: the sidebar holds still and only the page area changes, showing
 * that page's loading.tsx skeleton until the page is ready.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
