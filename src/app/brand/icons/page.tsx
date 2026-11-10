import type { Metadata } from "next";
import { AppTopbar } from "@/components/app/AppTopbar";
import { Icon, iconNames } from "@/components/brand/Icon";
import "@/components/app/app.css";
import "./icons.css";

export const metadata: Metadata = { title: "Icons | Tripweave" };

export default function IconsPage() {
  return (
    <div className="bi-page">
      <AppTopbar back={{ href: "/", label: "Home" }} />
      <div className="app-wrap">
        <header className="bi-head">
          <p className="mono">Brand · {iconNames.length} icons</p>
          <h1 className="display">Field Journal icons</h1>
          <p>
            Ink lines on a soft paper tint, one ember accent, a few fine hatch strokes. Utility icons (arrows, check, close) stay plain so they never
            compete with content.
          </p>
        </header>
        {(["light", "dark"] as const).map((tone) => (
          <section key={tone} className={`bi-grid bi-${tone}`} aria-label={`${tone} background`}>
            {iconNames.map((n) => (
              <figure key={n}>
                <Icon name={n} size={64} />
                <span className="bi-sizes">
                  <Icon name={n} size={24} />
                  <Icon name={n} size={16} />
                </span>
                <figcaption className="mono">{n}</figcaption>
              </figure>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
