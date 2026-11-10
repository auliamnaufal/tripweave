type IconName =
  | "arrow"
  | "arrow-left"
  | "plane"
  | "bed"
  | "compass"
  | "spark"
  | "chat"
  | "bell"
  | "heart"
  | "calendar"
  | "plus"
  | "map"
  | "pin"
  | "user"
  | "users"
  | "wallet"
  | "check"
  | "close"
  | "search"
  | "send"
  | "star"
  | "shield"
  | "clock"
  | "sun"
  | "leaf"
  | "chevron"
  | "expand"
  | "menu"
  | "ticket"
  | "sliders"
  | "refresh"
  | "mic"
  | "download"
  | "globe"
  | "paperclip"
  | "file"
  | "lock"
  | "trash"
  | "edit"
  | "upload"
  | "passport";

/*
 * "Field Journal" icon family.
 * Object icons get a soft paper tint (.i-f), one ember accent (.i-a fill, .i-as stroke)
 * and a few fine hatch strokes (.i-h). Utility icons (arrows, check, close…) stay plain ink lines.
 * Styling lives in globals.css; set --icon-accent on a parent to recolour the accent.
 */
const f = "i-f";
const a = "i-a";
const as = "i-as";
const h = "i-h";

const paths: Record<IconName, React.ReactNode> = {
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  "arrow-left": <path d="M19 12H5M11 6l-6 6 6 6" />,
  plane: (
    <g transform="translate(12 12) rotate(-24) scale(1.1) translate(-12 -12)">
      <path className={f} d="M12.6 13.6 9.4 19.4H7.6l1.6-5.8" />
      <path className={f} d="M11.8 10.4 9.8 6.8H8.4l.9 3.6" />
      <path className={a} d="M4.9 10.4 3.6 6.8h1.6l2.9 3.6Z" />
      <path className={f} d="M4.8 10.4h13.6c1.7 0 3.1.7 3.1 1.6s-1.4 1.6-3.1 1.6H5.2c-.8 0-1.4-.6-1.4-1.4v-.6c0-.7.4-1.2 1-1.2Z" />
      <path d="M10.4 12h1M13 12h1M15.6 12h1" strokeWidth={1.1} />
    </g>
  ),
  bed: (
    <>
      <path className={f} d="M5 11V7.6A2.6 2.6 0 0 1 7.6 5h8.8A2.6 2.6 0 0 1 19 7.6V11" />
      <circle className={a} stroke="none" cx="12" cy="7.5" r="1" />
      <rect className={f} x="6.6" y="8.9" width="4.4" height="2.3" rx="1.1" />
      <rect className={f} x="13" y="8.9" width="4.4" height="2.3" rx="1.1" />
      <path className={f} d="M3.5 13.6A2.6 2.6 0 0 1 6.1 11h11.8a2.6 2.6 0 0 1 2.6 2.6V17h-17v-3.4Z" />
      <path d="M5 17v2.2M19 17v2.2" />
      <path className={h} d="M15.6 16.4l1.8-1.8M17.8 16.4l1.8-1.8" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="3.4" r="1.1" />
      <path d="M12 4.5V6" />
      <circle className={f} cx="12" cy="13.5" r="7.5" />
      <path d="M12 7.6v1.1M12 18.3v1.1M6.1 13.5h1.1M16.8 13.5h1.1" strokeWidth={1.2} />
      <path className={a} stroke="none" d="M14.8 10.7 12.9 14.4 11.1 12.6Z" />
      <path d="M14.8 10.7 12.9 14.4 9.2 16.3 11.1 12.6Z" strokeWidth={1.3} />
      <path className={h} d="M15.4 18.6l2-2M13.6 19.8l1.8-1.8" />
    </>
  ),
  spark: (
    <>
      <path className={f} d="M11 3.5c.5 4.3 1.7 5.5 6 6-4.3.5-5.5 1.7-6 6-.5-4.3-1.7-5.5-6-6 4.3-.5 5.5-1.7 6-6Z" />
      <path className={a} d="M18.5 14.5c.2 1.8.7 2.3 2.5 2.5-1.8.2-2.3.7-2.5 2.5-.2-1.8-.7-2.3-2.5-2.5 1.8-.2 2.3-.7 2.5-2.5Z" />
    </>
  ),
  chat: (
    <>
      <path className={f} d="M12 4.5c4.7 0 8.5 3 8.5 6.8S16.7 18 12 18c-1.1 0-2.2-.2-3.2-.5L4.5 19.5l1.4-3.4C4.4 14.9 3.5 13.2 3.5 11.3 3.5 7.5 7.3 4.5 12 4.5Z" />
      <path d="M8.4 11.3h.01M15.6 11.3h.01" strokeWidth={2.1} />
      <circle className={a} stroke="none" cx="12" cy="11.3" r="1.05" />
      <path className={h} d="M14.6 16.4l2-2M17 15l1.4-1.4" />
    </>
  ),
  bell: (
    <>
      <circle className={a} cx="12" cy="3.6" r="1.1" />
      <path className={f} d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
      <path className={h} d="M13.4 16.8l2.6-2.6" />
    </>
  ),
  heart: (
    <>
      <path className={f} d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10Z" />
      <path className={as} d="M7 9.6c.2-.8.7-1.3 1.4-1.6" />
      <path className={h} d="M13.4 16.8l2.6-2.6M15.8 13.6l1.8-1.8" />
    </>
  ),
  calendar: (
    <>
      <rect className={f} x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <path className={h} d="M10.6 8.8l2.2-2.2M12.9 8.8l2-2" />
      <path d="M7.6 13h.01M10.5 13h.01M13.5 13h.01M16.4 13h.01M7.6 16.6h.01M10.5 16.6h.01M13.5 16.6h.01" strokeWidth={1.9} />
      <rect className={a} stroke="none" x="15.5" y="15.7" width="1.9" height="1.8" rx=".45" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  map: (
    <>
      <path className={f} d="m3.5 6.5 5.5-2.5 6 2.5 5.5-2.5v13.5L15 20l-6-2.5-5.5 2.5V6.5Z" />
      <path d="M9 4v13.5M15 6.5V20" />
      <path className={h} d="M9.8 16.2l4.4-4.4M9.8 12.4l4.4-4.4" />
      <circle className={a} stroke="none" cx="18" cy="10.5" r="1.15" />
    </>
  ),
  pin: (
    <>
      <path className={f} d="M12 16.8S7 12.3 7 8.3a5 5 0 0 1 10 0c0 4-5 8.5-5 8.5Z" />
      <circle className={a} stroke="none" cx="12" cy="8.3" r="1.9" />
      <path d="M3 20.6 6.4 17.4l2.6 2.1h6l2.6-2.4 3.4 3.5" strokeWidth={1.2} />
    </>
  ),
  user: (
    <>
      <circle className={f} cx="12" cy="8" r="3.8" />
      <path className={f} d="M4.5 20.5a7.5 7.5 0 0 1 15 0Z" />
      <path className={h} d="M14.4 19.4l2.2-2.2" />
    </>
  ),
  users: (
    <>
      <circle className={f} cx="9" cy="8.5" r="3.3" />
      <path className={f} d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0Z" />
      <path d="M15.5 5.6a3.3 3.3 0 0 1 0 5.8M17.5 13.6a6.2 6.2 0 0 1 3.7 5.9" />
    </>
  ),
  wallet: (
    <>
      <path d="M6.5 8 15.6 5.6a1.3 1.3 0 0 1 1.6 1.2V8" />
      <path className={f} d="M19.5 11.3v-.8A2.5 2.5 0 0 0 17 8H6a2.5 2.5 0 0 0-2.5 2.5v7A2.5 2.5 0 0 0 6 20h11a2.5 2.5 0 0 0 2.5-2.5v-2" />
      <path className={f} d="M20.6 11.3h-3.4a2.1 2.1 0 0 0 0 4.2h3.4Z" />
      <circle className={a} stroke="none" cx="17.4" cy="13.4" r=".95" />
      <path className={h} d="M5.4 18.6l1.8-1.8M7.6 18.6l1.8-1.8" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  search: (
    <>
      <circle className={f} cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
      <path className={as} d="M8.2 9.4a3.2 3.2 0 0 1 1.8-1.9" />
    </>
  ),
  send: (
    <>
      <path className={f} d="M4.5 12 20 4.5 15.5 20l-3.2-6.3L4.5 12Z" />
      <path d="M12.3 13.7 20 4.5" />
    </>
  ),
  star: <path className={f} d="m12 4 2.4 5 5.4.7-4 3.7 1 5.4L12 16.2 7.2 18.8l1-5.4-4-3.7 5.4-.7L12 4Z" />,
  shield: (
    <>
      <path className={f} d="M12 3.5 19 6v5.5c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6l7-2.5Z" />
      <path className={as} d="M15.4 4.7 18.2 5.7" />
      <path d="M9 12l2.2 2.2L15.5 10" />
      <path className={h} d="M13.4 18.4l2.6-2.6M15.2 15.4l2-2" />
    </>
  ),
  clock: (
    <>
      <circle className={f} cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
      <circle className={a} stroke="none" cx="12" cy="12" r="1.1" />
      <path className={h} d="M14.6 18.6l2.2-2.2" />
    </>
  ),
  sun: (
    <>
      <circle className={a} cx="12" cy="12" r="3.8" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5" />
    </>
  ),
  leaf: (
    <>
      <path className={f} d="M5 19c-.5-8 4.5-13.5 15-14.5-.3 10.2-5.8 15.2-15 14.5Z" />
      <path d="M5 19 15.5 8.5" />
      <path d="M8.8 15.2v-2.8M8.8 15.2h2.9M11.9 12.1V9.6M11.9 12.1h2.6" strokeWidth={1.1} />
      <path className={as} d="M17.6 6.9 20 4.5" strokeWidth={1.8} />
      <path className={h} d="M12.8 17.2l1.8-1.8M15.2 15.2l1.4-1.4" />
    </>
  ),
  chevron: <path d="m7 10 5 5 5-5" />,
  expand: <path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" />,
  menu: <path d="M4 8h16M4 16h16" />,
  ticket: (
    <>
      <path className={f} d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4V7.5Z" />
      <path d="M15 7.6v8.8" strokeWidth={1.2} strokeDasharray="1.1 1.7" />
      <path className={as} d="M16.9 10.6h1.4M16.9 13.4h1.4" strokeWidth={1.3} />
      <path d="M7 12h5.6M10.2 12 8.8 9.6M10.2 12l-1.4 2.4M7.7 12l-.6-1.1M7.7 12l-.6 1.1" strokeWidth={1.2} />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle className={a} cx="16" cy="7" r="2" />
      <circle className={f} cx="10" cy="17" r="2" />
    </>
  ),
  refresh: <path d="M19.5 9A8 8 0 0 0 5 7.5M4.5 15A8 8 0 0 0 19 16.5M19.5 4v5h-5M4.5 20v-5h5" />,
  mic: (
    <>
      <rect className={f} x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
      <path className={as} d="M11 7.5h2M11 10h2" strokeWidth={1.3} />
    </>
  ),
  download: <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />,
  globe: (
    <>
      <circle className={f} cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5s1.1-5.9 3.6-8.5Z" strokeWidth={1.3} />
      <circle className={a} stroke="none" cx="16.9" cy="8.2" r="1.15" />
      <path className={h} d="M16.4 17.4l1.8-1.8" />
    </>
  ),
  paperclip: <path d="M20 11.5 12.2 19.3a5 5 0 0 1-7.1-7.1l8-8a3.4 3.4 0 0 1 4.8 4.8l-7.9 7.9a1.8 1.8 0 0 1-2.5-2.5l7.2-7.2" />,
  file: (
    <>
      <path className={f} d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8L14 3.5Z" />
      <path d="M14 3.5V8h4.5M9 16.5h4" />
      <path className={as} d="M9 13h6" />
    </>
  ),
  lock: (
    <>
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      <rect className={f} x="5" y="10.5" width="14" height="10" rx="2.5" />
      <circle className={a} stroke="none" cx="12" cy="14.6" r="1.3" />
      <path className={as} d="M12 15.6v1.8" />
      <path className={h} d="M14.8 19.6l2.6-2.6" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15M10 4h4" />
      <path className={f} d="m6.5 7 .8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  edit: (
    <>
      <path className={f} d="M4.5 19.5h4l10-10a2.8 2.8 0 0 0-4-4l-10 10v4Z" />
      <path className={a} stroke="none" d="M5.3 16.4v2.3h2.3Z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  upload: <path d="M12 16V5M7 9.5l5-5 5 5M5 20h14" />,
  passport: (
    <>
      <path d="M7.5 5 16.4 3.3A1.3 1.3 0 0 1 18 4.6V5" />
      <rect className={f} x="5" y="5" width="13.5" height="16" rx="2" />
      <circle cx="11.75" cy="11.5" r="3.4" strokeWidth={1.3} />
      <path d="M11.75 8.1c-1.6 1.9-1.6 4.9 0 6.8M11.75 8.1c1.6 1.9 1.6 4.9 0 6.8M8.35 11.5h6.8" strokeWidth={1.1} />
      <path className={as} d="M9.8 17.6h3.9" />
      <path className={h} d="M14.4 20.2l2.6-2.6" />
    </>
  ),
};

export const iconNames = Object.keys(paths) as IconName[];

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ? `icon ${className}` : "icon"}
    >
      {paths[name]}
    </svg>
  );
}

export type { IconName };
