"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { Icon } from "@/components/brand/Icon";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { useLenis } from "@/components/motion/SmoothScroll";
import { useUser } from "@/features/ui-mock/tripStore";

const links = [
  { href: "#journeys", label: "Journeys" },
  { href: "#cities", label: "Places" },
  { href: "#how", label: "How it works" },
  { href: "#weave", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function SiteNav() {
  const ref = useRef<HTMLElement>(null);
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [open, setOpen] = useState(false);
  const lenis = useLenis();
  const user = useUser();

  useGSAP(
    () => {
      const sections = gsap.utils.toArray<HTMLElement>("[data-nav]");
      sections.forEach((section) => {
        ScrollTrigger.create({
          trigger: section,
          start: "top 36px",
          end: "bottom 36px",
          onToggle: (self) => {
            if (self.isActive) setTheme(section.dataset.nav === "light" ? "light" : "dark");
          },
          onRefresh: (self) => {
            if (self.isActive) setTheme(section.dataset.nav === "light" ? "light" : "dark");
          },
        });
      });

      let hidden = false;
      ScrollTrigger.create({
        start: 0,
        end: "max",
        onUpdate: (self) => {
          const shouldHide = self.direction === 1 && self.scroll() > 320;
          if (shouldHide !== hidden) {
            hidden = shouldHide;
            gsap.to(ref.current, { yPercent: shouldHide ? -130 : 0, duration: 0.6, ease: "power3.out" });
          }
          ref.current?.classList.toggle("is-scrolled", self.scroll() > 40);
        },
      });

      gsap.from(".site-nav > *", { y: -24, opacity: 0, duration: 1.2, stagger: 0.08, delay: 0.9, ease: "expo.out" });
    },
    { scope: ref },
  );

  function go(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (!href.startsWith("#")) return;
    event.preventDefault();
    setOpen(false);
    const target = document.querySelector(href);
    if (!target) return;
    if (lenis) lenis.scrollTo(target as HTMLElement, { offset: 0, duration: 1.6 });
    else target.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <>
      <header ref={ref} className={`site-nav-shell theme-${theme} ${open ? "is-open" : ""}`}>
        <nav className="site-nav wrap" aria-label="Main">
          <Link href="/" className="logo" aria-label="Tripweave home">
            <LogoMark />
            <span>Tripweave</span>
          </Link>
          <ul className="site-nav-links">
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href} onClick={(e) => go(e, link.href)}>
                  <span data-text={link.label}>{link.label}</span>
                </a>
              </li>
            ))}
          </ul>
          <div className="site-nav-actions">
            {user ? (
              <Link href="/account" className="site-nav-user" title="Your account">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={user.avatar} alt="" />
                <span>{user.firstName}</span>
              </Link>
            ) : (
              <Link href="/login" className="site-nav-signin">
                Sign in
              </Link>
            )}
            <Link href="/plan" className="btn btn-sm site-nav-cta">
              Plan a trip
              <span className="btn-arrow">
                <Icon name="arrow" />
              </span>
            </Link>
            <button
              type="button"
              className="site-nav-burger"
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
            >
              <span />
              <span />
            </button>
          </div>
        </nav>
      </header>
      <div className={`mobile-menu ${open ? "is-open" : ""}`} aria-hidden={!open}>
        <ul>
          {links.map((link, i) => (
            <li key={link.href} style={{ transitionDelay: open ? `${0.08 + i * 0.05}s` : "0s" }}>
              <a href={link.href} onClick={(e) => go(e, link.href)} tabIndex={open ? 0 : -1}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <Link href={user ? "/account" : "/login"} className="mobile-menu-account" tabIndex={open ? 0 : -1}>
          {user ? `Signed in as ${user.firstName} · Account` : "Sign in"}
        </Link>
        <Link href="/plan" className="btn btn-ember" tabIndex={open ? 0 : -1}>
          Plan a trip
          <span className="btn-arrow">
            <Icon name="arrow" />
          </span>
        </Link>
      </div>
    </>
  );
}
