import Link from "next/link";

/** Tripweave mark: two threads crossing into a knot, read as a stylised "T" and a loop. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <circle cx="16" cy="16" r="15" fill="currentColor" opacity="0.08" />
      <path
        d="M6 10.5C11 8 21 8 26 10.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M16 9.4V18.2C16 22.6 12.6 25.2 9.6 23.6C6.8 22.1 8 18 12 18.4C16.6 18.9 19.4 22.6 23.4 24"
        stroke="var(--ember)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`logo ${className}`} aria-label="Tripweave home">
      <LogoMark />
      <span>Tripweave</span>
    </Link>
  );
}
