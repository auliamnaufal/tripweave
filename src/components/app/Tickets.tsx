"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { AppTopbar } from "@/components/app/AppTopbar";
import { Icon, type IconName } from "@/components/brand/Icon";
import { PlatformMark } from "@/components/app/DealPanel";
import type { TicketItem, TicketsResponse } from "@/app/api/tickets/route";
import { useLivePayment } from "@/features/live/liveStore";
import "./tickets.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd = (minor: number) => money.format(minor / 100);

const kindIcon: Record<TicketItem["kind"], IconName> = { flight: "plane", hotel: "bed", activity: "ticket" };
const kindLabel: Record<TicketItem["kind"], string> = { flight: "Boarding pass", hotel: "Hotel voucher", activity: "Activity ticket" };

/** Times print in the offer's own offset, the way the airport or hotel shows them. */
function localParts(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return { date: iso, time: "" };
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return { date, time: `${m[4]}:${m[5]}` };
}

function route(title: string): { from: string; to: string } | null {
  const m = /^([A-Z]{3}) to ([A-Z]{3})/.exec(title);
  return m ? { from: m[1], to: m[2] } : null;
}

function Qr({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 1, width: 240, color: { dark: "#18201b", light: "#fbf9f4" }, errorCorrectionLevel: "M" })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(""));
    return () => {
      alive = false;
    };
  }, [value]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className="tk-qr" src={src} alt={`QR code for ${label}`} width={120} height={120} /> : <span className="tk-qr is-empty" />;
}

function Ticket({ item, travellers }: { item: TicketItem; travellers: string[] }) {
  const start = localParts(item.startsAt);
  const end = localParts(item.endsAt);
  const leg = item.kind === "flight" ? route(item.title) : null;
  const booked = item.status === "booked" || item.status === "paid_direct";
  return (
    <article className={`tk ${booked ? "" : "is-void"}`} aria-label={`${kindLabel[item.kind]}: ${item.title}`}>
      <div className="tk-main">
        <header className="tk-head">
          <span className="tk-kind">
            <Icon name={kindIcon[item.kind]} size={14} /> {kindLabel[item.kind]}
          </span>
          <span className="tk-platform">
            <PlatformMark supplier={item.platform.supplier} label={item.platform.label} small />
            {item.platform.label}
            {item.platform.data === "simulated" && <small>simulated partner</small>}
          </span>
        </header>

        {leg ? (
          <div className="tk-route">
            <div>
              <b>{leg.from}</b>
              <small>
                {start.date} · {start.time}
              </small>
            </div>
            <Icon name="plane" size={18} />
            <div>
              <b>{leg.to}</b>
              <small>
                {end.date} · {end.time}
              </small>
            </div>
          </div>
        ) : (
          <div className="tk-title">
            <b>{item.title}</b>
            <small>
              {item.kind === "hotel" ? `Check-in ${start.date} · Check-out ${end.date}` : `${start.date} · ${start.time}`}
            </small>
          </div>
        )}

        <dl className="tk-facts">
          <div>
            <dt>{item.kind === "flight" ? "Passengers" : "Guests"}</dt>
            <dd>{travellers.length ? travellers.join(", ") : "Lead traveller"}</dd>
          </div>
          <div>
            <dt>{item.kind === "flight" ? "Booking ref" : "Confirmation"}</dt>
            <dd className="tk-mono">{item.bookingRef ?? "—"}</dd>
          </div>
          {item.kind === "flight" && (
            <div>
              <dt>Seat</dt>
              <dd>At check-in</dd>
            </div>
          )}
          <div>
            <dt>Paid</dt>
            <dd>{usd(item.costMinorUnits)}</dd>
          </div>
        </dl>
        {!booked && (
          <p className="tk-void-note">
            Not booked{item.failureReason ? `: ${item.failureReason}` : ""}. {item.refunded ? `${usd(item.costMinorUnits)} refunded to your PayPal.` : ""}
          </p>
        )}
      </div>
      <div className="tk-stub">
        {booked ? <Qr value={item.qr} label={item.title} /> : <span className="tk-qr is-empty" />}
        <small className="tk-mono">{booked ? "Show at check-in" : "Void"}</small>
      </div>
    </article>
  );
}

export function Tickets({ orderId: requested }: { orderId?: string }) {
  const payment = useLivePayment();
  const orderId = requested ?? payment?.orderId;
  const [state, setState] = useState<{ data?: TicketsResponse; error?: string }>({});

  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    fetch(`/api/tickets?orderId=${encodeURIComponent(orderId)}`)
      .then(async (response) => {
        const body = (await response.json()) as TicketsResponse & { error?: string };
        if (!alive) return;
        setState(response.ok ? { data: body } : { error: body.error ?? "Tickets are unavailable." });
      })
      .catch(() => alive && setState({ error: "Tickets are unavailable right now." }));
    return () => {
      alive = false;
    };
  }, [orderId]);

  const travellers = state.data?.travellers.map((t) => `${t.firstName} ${t.lastName}`) ?? [];

  return (
    <div className="tk-page">
      <AppTopbar back={{ href: "/booked", label: "Booking" }} />
      <main className="app-wrap tk-wrap">
        <header className="tk-pagehead">
          <p className="tk-kicker">E-tickets</p>
          <h1 className="display">Your trip documents</h1>
          {state.data && (
            <p className="tk-sub">
              PayPal order <span className="tk-mono">{state.data.orderId}</span> · {usd(state.data.paidMinorUnits)} paid once
            </p>
          )}
        </header>

        {!orderId && (
          <p className="tk-empty">
            No paid trip on this device yet. <Link href="/plan">Plan one</Link>.
          </p>
        )}
        {state.error && <p className="tk-empty">{state.error}</p>}
        {orderId && !state.data && !state.error && <p className="tk-empty">Loading your tickets…</p>}

        {state.data && (
          <div className="tk-list">
            {state.data.items.map((item) => (
              <Ticket key={item.offerId} item={item} travellers={travellers} />
            ))}
          </div>
        )}

        <p className="tk-fineprint">
          Demo booking references (SIM-… and sandbox codes) are not valid for travel. QR codes encode the order and booking
          reference only, never personal data.
        </p>
      </main>
    </div>
  );
}
