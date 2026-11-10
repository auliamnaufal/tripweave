import type { Metadata } from "next";
import Link from "next/link";
import { AppTopbar } from "@/components/app/AppTopbar";
import "@/components/app/app.css";
import "./legal.css";

export const metadata: Metadata = { title: "Terms & privacy | Tripweave" };

const sections = [
  {
    id: "terms",
    title: "Terms of use",
    body: [
      "Tripweave is a prototype built for demonstration. Flights, stays, activities, prices and availability are sample data and are not offers to sell. Final prices are confirmed by each supplier at booking.",
      "Plans are drafted by an AI agent. They can be wrong or out of date, so review every detail before you approve a payment. Budget totals are calculated by code, not by the model.",
      "When you pay, Tripweave is the merchant of record and books each supplier on your behalf. Each supplier’s own terms also apply, including airline fare rules and hotel cancellation policies. A booking that fails is refunded.",
    ],
  },
  {
    id: "privacy",
    title: "Privacy notice",
    body: [
      "We collect what we need to plan and book your trip: your trip preferences, contact details, and the travel documents you choose to upload.",
      "We do not sell your personal data and we do not use your documents or conversations to train AI models.",
      "Payment details are handled by PayPal. Tripweave never sees or stores your card or PayPal credentials.",
      "You can ask us to export or delete your data at any time. In this demo, everything lives in your own browser and is removed when you clear site data.",
    ],
  },
  {
    id: "documents",
    title: "Travel documents and your data",
    body: [
      "Upload passports, ID, visas or insurance in the planner chat or in Account → Travel documents. They’re used only to complete your bookings.",
      "A document goes only to the airline or hotel that needs it, and only after you approve payment. With “Ask before each share” on, you confirm each share first.",
      "In this demo the file itself is discarded after reading. Only the document type, holder name, last four digits and expiry date are kept, in your browser.",
      "You can edit, replace or delete any document, say “remove my passport” in the chat, or turn on automatic deletion 30 days after your trip.",
      "Entry checklists are general guidance, not legal or immigration advice. Rules depend on your nationality and change often. Confirm them with the official government source of your destination. You’re responsible for holding valid documents.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies and local storage",
    body: [
      "Tripweave uses your browser’s local storage to remember your session, plans and saved documents on this device. We don’t use advertising cookies.",
    ],
  },
];

export default function LegalPage() {
  return (
    <div className="lg-page">
      <AppTopbar back={{ href: "/", label: "Home" }} />
      <div className="app-wrap lg-wrap">
        <header className="lg-head">
          <p className="mono">Last updated 10 November 2026</p>
          <h1 className="display">Terms &amp; privacy</h1>
          <p>The short version: we only use your details to plan and book your trip, we share documents only with the suppliers that need them, and you can delete everything.</p>
        </header>
        <nav className="lg-toc" aria-label="On this page">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.title}
            </a>
          ))}
        </nav>
        {sections.map((s) => (
          <section key={s.id} id={s.id} className="lg-section">
            <h2>{s.title}</h2>
            {s.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </section>
        ))}
        <p className="lg-foot">
          Questions about your data? Manage your documents in <Link href="/account?tab=documents">Account → Travel documents</Link>.
        </p>
      </div>
    </div>
  );
}
