import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import QRCode from "qrcode";
import { code128Modules, encodeCode128B } from "./code128";
import { isTicketable, type TicketItem, type TicketsResponse } from "./types";

// A4 portrait, in PDF points. Layout works top-down with `y` measured from the
// top edge; `at(y)` flips it into pdf-lib's bottom-up coordinates.
const W = 595.28;
const H = 841.89;
const M = 40;
const CW = W - 2 * M;
const at = (y: number) => H - y;

const hex = (value: string): RGB => {
  const n = parseInt(value.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const C = {
  ink: hex("#18201b"),
  soft: hex("#545c55"),
  faint: hex("#61645e"),
  line: hex("#d9d3c6"),
  paper: hex("#f4f1ea"),
  surface: hex("#fbf9f4"),
  ember: hex("#c9512a"),
  emberDeep: hex("#a63f1f"),
  emberWash: hex("#f6e3d8"),
  white: rgb(1, 1, 1),
};

const DOC_TYPE: Record<TicketItem["kind"], string> = { flight: "E-Ticket", hotel: "Hotel Voucher", activity: "Activity Ticket" };
const PEOPLE: Record<TicketItem["kind"], string> = { flight: "Passengers", hotel: "Guests", activity: "Participants" };
export const SANDBOX_MARK = "SANDBOX BOOKING · NOT VALID FOR TRAVEL";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd = (minor: number) => money.format(minor / 100);

type Fonts = { regular: PDFFont; bold: PDFFont; mono: PDFFont };

/** Date and time as written in the offer, in its own UTC offset (airport/hotel local time). */
export function localParts(iso: string): { date: string; time: string; offset: string; ymd: number | null } {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(iso);
  if (!m) return { date: iso, time: "", offset: "", ymd: null };
  const ymd = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const date = new Date(ymd + 12 * 3600_000).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const offset = !m[6] ? "" : m[6] === "Z" ? "UTC" : `UTC${m[6].length === 5 ? `${m[6].slice(0, 3)}:${m[6].slice(3)}` : m[6]}`;
  return { date, time: `${m[4]}:${m[5]}`, offset, ymd };
}

function duration(startsAt: string, endsAt: string): string | null {
  const ms = Date.parse(endsAt) - Date.parse(startsAt);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.round(ms / 60_000);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** "CGK to NRT, 1 stop" → route parts; null when the title isn't an IATA pair. */
export function flightRoute(title: string): { from: string; to: string; stops: string | null } | null {
  const m = /^([A-Z]{3}) to ([A-Z]{3})(?:,\s*(.+))?/.exec(title);
  return m ? { from: m[1], to: m[2], stops: m[3] ? m[3].replace(/^\w/, (c) => c.toUpperCase()) : null } : null;
}

/** Carrier and segment count, only when the summary states them ("Garuda flight, 2 segment(s)."). */
export function flightFacts(summary: string): { carrier: string | null; segments: number | null } {
  const m = /^(.+?) flight, (\d+) segment/.exec(summary);
  if (!m) return { carrier: null, segments: null };
  return { carrier: m[1] === "Carrier" ? null : m[1], segments: Number(m[2]) };
}

// Standard PDF fonts only cover WinAnsi; swap the few symbols suppliers use and
// drop anything else rather than letting pdf-lib throw mid-document.
const SWAPS: Record<string, string> = { "★": "*", "→": "->", "←": "<-", "✓": "", " ": " " };
function cleaner(font: PDFFont) {
  const charset = new Set(font.getCharacterSet());
  return (text: string) =>
    [...text]
      .map((ch) => SWAPS[ch] ?? ch)
      .join("")
      .split("")
      .filter((ch) => charset.has(ch.codePointAt(0) ?? 0) || ch === " ")
      .join("");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number, maxLines = Infinity): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && font.widthOfTextAtSize(`${last}...`, size) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}...`;
  return kept;
}

function fitSize(text: string, font: PDFFont, max: number, min: number, width: number): number {
  let size = max;
  while (size > min && font.widthOfTextAtSize(text, size) > width) size -= 0.5;
  return size;
}

class Painter {
  private clean: { regular: (s: string) => string; bold: (s: string) => string; mono: (s: string) => string };
  constructor(
    readonly page: PDFPage,
    readonly fonts: Fonts,
  ) {
    this.clean = { regular: cleaner(fonts.regular), bold: cleaner(fonts.bold), mono: cleaner(fonts.mono) };
  }

  text(
    raw: string,
    x: number,
    y: number,
    opts: { size?: number; font?: keyof Fonts; color?: RGB; align?: "left" | "right" | "center"; maxWidth?: number } = {},
  ): number {
    const fontKey = opts.font ?? "regular";
    const font = this.fonts[fontKey];
    let size = opts.size ?? 10;
    const value = this.clean[fontKey](raw);
    if (opts.maxWidth) size = fitSize(value, font, size, Math.min(size, 6), opts.maxWidth);
    const width = font.widthOfTextAtSize(value, size);
    const left = opts.align === "right" ? x - width : opts.align === "center" ? x - width / 2 : x;
    this.page.drawText(value, { x: left, y: at(y), size, font, color: opts.color ?? C.ink });
    return width;
  }

  label(raw: string, x: number, y: number, align: "left" | "right" = "left") {
    this.text(raw.toUpperCase(), x, y, { size: 7, font: "bold", color: C.faint, align });
  }

  paragraph(raw: string, x: number, y: number, width: number, opts: { size?: number; color?: RGB; maxLines?: number; leading?: number } = {}): number {
    const size = opts.size ?? 9;
    const lines = wrap(this.clean.regular(raw), this.fonts.regular, size, width, opts.maxLines);
    const leading = opts.leading ?? size * 1.4;
    lines.forEach((line, i) => this.text(line, x, y + i * leading, { size, color: opts.color ?? C.soft }));
    return lines.length * leading;
  }

  rect(x: number, y: number, w: number, h: number, opts: { fill?: RGB; border?: RGB; borderWidth?: number; dash?: number[] } = {}) {
    this.page.drawRectangle({
      x,
      y: at(y + h),
      width: w,
      height: h,
      color: opts.fill,
      borderColor: opts.border,
      borderWidth: opts.border ? (opts.borderWidth ?? 0.75) : 0,
      borderDashArray: opts.dash,
    });
  }

  line(x1: number, y1: number, x2: number, y2: number, color = C.line, thickness = 0.75, dash?: number[]) {
    this.page.drawLine({ start: { x: x1, y: at(y1) }, end: { x: x2, y: at(y2) }, color, thickness, dashArray: dash });
  }

  /** Pill tag: outlined, uppercase, small. Returns its width. */
  tag(raw: string, x: number, y: number, color: RGB, fill: RGB): number {
    const size = 6.8;
    const value = this.clean.bold(raw);
    const width = this.fonts.bold.widthOfTextAtSize(value, size) + 12;
    this.page.drawRectangle({ x, y: at(y + 14), width, height: 14, color: fill, borderColor: color, borderWidth: 0.75 });
    this.text(value, x + 6, y + 9.8, { size, font: "bold", color });
    return width;
  }
}

function drawBarcode(p: Painter, value: string, x: number, y: number, maxWidth: number, height: number): number {
  const code = encodeCode128B(value);
  const quiet = 10;
  const moduleWidth = Math.min(1.2, maxWidth / (code128Modules(code) + 2 * quiet));
  let cursor = x + quiet * moduleWidth;
  code.widths.forEach((width, i) => {
    if (i % 2 === 0) p.page.drawRectangle({ x: cursor, y: at(y + height), width: width * moduleWidth, height, color: C.ink });
    cursor += width * moduleWidth;
  });
  return cursor + quiet * moduleWidth - x;
}

/** Printable-ASCII copy of a booking reference, safe for Code 128-B and filenames. */
const asciiRef = (ref: string) => ref.replace(/[^\x20-\x7e]/g, "").trim();

type PageContext = {
  tickets: TicketsResponse;
  item: TicketItem;
  qr: PDFImage;
  issued: Date;
  index: number;
  count: number;
};

function drawTicketPage(p: Painter, ctx: PageContext) {
  const { tickets, item, issued } = ctx;
  const simulated = item.platform.data === "simulated";
  const ref = item.bookingRef ? asciiRef(item.bookingRef) : "";
  const issuedText = issued.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  // 1. Brand bar
  p.rect(0, 0, W, 76, { fill: C.ink });
  p.rect(0, 76, W, 4, { fill: C.ember });
  p.text("Tripweave", M, 42, { size: 22, font: "bold", color: C.surface });
  p.text("Itinerary plans, paid once with PayPal", M, 58, { size: 8.5, color: hex("#b9c0b6") });
  p.text(DOC_TYPE[item.kind].toUpperCase(), W - M, 40, { size: 15, font: "bold", color: C.emberWash, align: "right" });
  p.text(`Issued ${issuedText}  ·  Document ${ctx.index} of ${ctx.count}`, W - M, 58, {
    size: 8.5,
    color: hex("#b9c0b6"),
    align: "right",
  });

  // 2. Booking code, sandbox mark, meta; QR on the right
  const qrSize = 108;
  const leftWidth = CW - qrSize - 24;
  p.label(item.kind === "flight" ? "Booking code" : "Confirmation code", M, 108);
  if (ref) {
    p.text(ref, M, 134, { size: 24, font: "mono", maxWidth: leftWidth });
  } else {
    p.text("Issued by supplier", M, 132, { size: 20, font: "bold" });
  }
  const sandboxWidth = p.tag(SANDBOX_MARK, M, 144, C.emberDeep, C.emberWash);
  if (simulated) p.tag("SIMULATED PARTNER", M + sandboxWidth + 6, 144, C.soft, C.paper);

  const metaY = 182;
  const colW = leftWidth / 3;
  const meta: [string, string][] = [
    ["PayPal order", tickets.orderId],
    ["Booked via", item.platform.label + (simulated ? " (simulated)" : "")],
    ["Status", item.status === "paid_direct" ? "Paid to supplier" : "Confirmed (sandbox)"],
  ];
  meta.forEach(([k, v], i) => {
    p.label(k, M + i * colW, metaY);
    p.text(v, M + i * colW, metaY + 14, { size: 9.5, font: "bold", maxWidth: colW - 10 });
  });

  const qrX = W - M - qrSize;
  p.rect(qrX - 6, 96, qrSize + 12, qrSize + 12, { fill: C.surface, border: C.line });
  p.page.drawImage(ctx.qr, { x: qrX, y: at(102 + qrSize), width: qrSize, height: qrSize });
  p.text("References only, no personal data", qrX + qrSize / 2, 228, { size: 6.5, color: C.faint, align: "center" });

  // 3. Main itinerary block
  const boxY = 244;
  const boxH = 150;
  p.rect(M, boxY, CW, boxH, { fill: C.paper, border: C.line });
  const pad = 18;
  const start = localParts(item.startsAt);
  const end = localParts(item.endsAt);
  const leg = item.kind === "flight" ? flightRoute(item.title) : null;

  if (leg) {
    const facts = flightFacts(item.summary);
    const lx = M + pad;
    const rx = M + CW - pad;
    p.label("From", lx, boxY + 22);
    p.label("To", rx, boxY + 22, "right");
    p.text(leg.from, lx, boxY + 62, { size: 40, font: "bold" });
    p.text(leg.to, rx, boxY + 62, { size: 40, font: "bold", align: "right" });
    p.text(start.date, lx, boxY + 80, { size: 9, color: C.soft });
    p.text(end.date, rx, boxY + 80, { size: 9, color: C.soft, align: "right" });
    p.text(`${start.time}${start.offset ? `  (${start.offset})` : ""}`, lx, boxY + 96, { size: 12, font: "bold" });
    p.text(`${end.time}${end.offset ? `  (${end.offset})` : ""}`, rx, boxY + 96, { size: 12, font: "bold", align: "right" });

    // Route line with an arrowhead between the two airports.
    const midL = lx + 120;
    const midR = rx - 120;
    const lineY = boxY + 48;
    p.line(midL, lineY, midR - 6, lineY, C.ember, 1.2, [3, 3]);
    p.page.drawCircle({ x: midL, y: at(lineY), size: 2.5, color: C.ember });
    p.page.drawSvgPath("M 0 -4 L 8 0 L 0 4 Z", { x: midR - 8, y: at(lineY), color: C.ember });
    const dur = duration(item.startsAt, item.endsAt);
    if (dur) p.text(dur, (midL + midR) / 2, lineY - 8, { size: 9, font: "bold", color: C.ink, align: "center" });
    if (leg.stops) p.text(leg.stops, (midL + midR) / 2, lineY + 16, { size: 8.5, color: C.soft, align: "center" });

    p.line(M + pad, boxY + 112, M + CW - pad, boxY + 112);
    const flightMeta: [string, string][] = [];
    if (facts.carrier) flightMeta.push(["Carrier", facts.carrier]);
    if (facts.segments) flightMeta.push(["Segments", String(facts.segments)]);
    flightMeta.push(["Seat", "Assigned at check-in"]);
    flightMeta.push(["Times", "Local to each airport"]);
    const fw = (CW - 2 * pad) / flightMeta.length;
    flightMeta.forEach(([k, v], i) => {
      p.label(k, lx + i * fw, boxY + 128);
      p.text(v, lx + i * fw, boxY + 141, { size: 9, font: "bold", maxWidth: fw - 8 });
    });
  } else {
    const lx = M + pad;
    p.label(item.kind === "hotel" ? "Property" : item.kind === "flight" ? "Flight" : "Activity", lx, boxY + 22);
    p.text(item.title, lx, boxY + 44, { size: 17, font: "bold", maxWidth: CW - 2 * pad });
    if (item.summary) p.paragraph(item.summary, lx, boxY + 62, CW - 2 * pad, { size: 9, maxLines: 2 });
    p.line(M + pad, boxY + 96, M + CW - pad, boxY + 96);

    const cols: [string, string, string?][] = [];
    if (item.kind === "hotel") {
      const nights = start.ymd !== null && end.ymd !== null ? Math.round((end.ymd - start.ymd) / 86_400_000) : null;
      cols.push(["Check-in", start.date]);
      cols.push(["Check-out", end.date]);
      if (nights && nights > 0) cols.push(["Nights", String(nights)]);
      cols.push(["Guests", tickets.travellers.length ? String(tickets.travellers.length) : "As booked"]);
    } else {
      cols.push(["Date", start.date]);
      cols.push(["Starts", `${start.time}${start.offset ? ` (${start.offset})` : ""}`]);
      cols.push(["Ends", end.date === start.date ? end.time : `${end.date} ${end.time}`]);
      cols.push(["Participants", tickets.travellers.length ? String(tickets.travellers.length) : "As booked"]);
    }
    const fw = (CW - 2 * pad) / cols.length;
    cols.forEach(([k, v], i) => {
      p.label(k, lx + i * fw, boxY + 116);
      p.text(v, lx + i * fw, boxY + 132, { size: 10.5, font: "bold", maxWidth: fw - 8 });
    });
  }

  // 4. Passenger / guest table
  let y = boxY + boxH + 28;
  p.text(PEOPLE[item.kind], M, y, { size: 11, font: "bold" });
  y += 10;
  const rowH = 20;
  const colNo = M + 10;
  const colName = M + 40;
  const colRef = M + CW * 0.58;
  p.rect(M, y, CW, rowH, { fill: C.ink });
  p.text("#", colNo, y + 13.5, { size: 7.5, font: "bold", color: C.surface });
  p.text("FULL NAME", colName, y + 13.5, { size: 7.5, font: "bold", color: C.surface });
  p.text(item.kind === "flight" ? "BOOKING CODE" : "CONFIRMATION", colRef, y + 13.5, { size: 7.5, font: "bold", color: C.surface });
  y += rowH;
  const people = tickets.travellers.map((t) => `${t.lastName.toUpperCase()} / ${t.firstName}`.trim());
  const shown = people.length ? people.slice(0, 6) : ["Lead traveller (name not provided at checkout)"];
  shown.forEach((name, i) => {
    if (i % 2 === 1) p.rect(M, y, CW, rowH, { fill: C.paper });
    p.text(String(i + 1), colNo, y + 13.5, { size: 9, color: C.soft });
    p.text(name, colName, y + 13.5, { size: 9.5, font: "bold", maxWidth: colRef - colName - 10 });
    p.text(ref || "Issued by supplier", colRef, y + 13.5, { size: 9, font: ref ? "mono" : "regular", maxWidth: M + CW - colRef - 10 });
    y += rowH;
  });
  if (people.length > shown.length) {
    p.text(`and ${people.length - shown.length} more on this booking`, colName, y + 12, { size: 8.5, color: C.soft });
    y += rowH;
  }
  p.line(M, y, M + CW, y);

  // 5. Payment + barcode stub
  y += 24;
  const stubH = 84;
  const half = CW / 2;
  p.rect(M, y, CW, stubH, { fill: C.surface, border: C.line });
  p.line(M + half, y + 10, M + half, y + stubH - 10, C.line, 0.75, [2, 3]);
  p.label("Amount paid for this item", M + 16, y + 20);
  p.text(usd(item.costMinorUnits), M + 16, y + 46, { size: 22, font: "bold" });
  p.paragraph(
    `Part of one PayPal sandbox payment of ${usd(tickets.paidMinorUnits)} (order ${tickets.orderId}).`,
    M + 16,
    y + 62,
    half - 32,
    { size: 7.5, maxLines: 2, leading: 10 },
  );
  if (ref) {
    const bw = half - 40;
    const used = drawBarcode(p, ref, M + half + 20, y + 14, bw, 42);
    p.text(ref, M + half + 20 + used / 2, y + 70, { size: 8, font: "mono", align: "center", color: C.soft, maxWidth: bw });
  } else {
    p.paragraph("The supplier sends its own confirmation code for this item.", M + half + 20, y + 36, half - 40, { size: 9 });
  }
  y += stubH + 26;

  // 6. Important information
  p.text("Important information", M, y, { size: 11, font: "bold" });
  y += 16;
  const notes: string[] = [];
  notes.push(
    item.status === "paid_direct"
      ? `Paid directly to ${item.platform.label} in the PayPal sandbox. The supplier confirms this booking itself; Tripweave did not book it.`
      : "This booking was made in test mode. The supplier booking behind it is simulated: no seat, room or place is held, and it is not an airline- or supplier-issued ticket.",
  );
  if (simulated) {
    notes.push(`${item.platform.label} is a simulated partner standing in for a real travel supplier. Its prices were generated for the demo.`);
  } else {
    notes.push(`Prices and schedule came from ${item.platform.label}'s live test-mode data at the time of planning.`);
  }
  if (item.kind === "flight") notes.push("Times are shown in each airport's local time, with the UTC offset in brackets.");
  if (item.kind === "hotel") notes.push("Check-in and check-out follow the property's own policy; present this voucher with a photo ID.");
  if (item.cancellationTerms) notes.push(`Cancellation: ${item.cancellationTerms}`);
  notes.push("The QR code and barcode encode the order and booking references only, never personal data.");
  const footerTop = H - 62;
  for (const note of notes) {
    const lines = wrap(note, p.fonts.regular, 8.5, CW - 14);
    if (y + lines.length * 12 > footerTop - 6) break;
    p.page.drawCircle({ x: M + 3, y: at(y - 3), size: 1.6, color: C.ember });
    p.paragraph(note, M + 12, y, CW - 14, { size: 8.5, leading: 12 });
    y += lines.length * 12 + 4;
  }

  // 7. Footer
  p.line(M, footerTop, M + CW, footerTop);
  p.text(`Tripweave  ·  ${SANDBOX_MARK.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}`, M, footerTop + 16, {
    size: 7.5,
    font: "bold",
    color: C.emberDeep,
  });
  p.text(`Page ${ctx.index} of ${ctx.count}`, W - M, footerTop + 16, { size: 7.5, color: C.faint, align: "right" });
  p.text(
    `Generated ${issued.toISOString().slice(0, 16).replace("T", " ")} UTC from the stored booking records of PayPal order ${tickets.orderId}.`,
    M,
    footerTop + 28,
    { size: 7, color: C.faint, maxWidth: CW },
  );
}

/** The items that get a page: booked or paid-direct, never failed, pending or refunded. */
export function ticketableItems(tickets: TicketsResponse, offerId?: string): TicketItem[] {
  return tickets.items.filter((item) => isTicketable(item) && (!offerId || item.offerId === offerId));
}

/** Filename-safe reference for a download: the booking code for one item, else the order id. */
export function pdfFileRef(tickets: TicketsResponse, items: readonly TicketItem[]): string {
  const raw = items.length === 1 ? (items[0].bookingRef ?? items[0].offerId) : tickets.orderId;
  return raw.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "tickets";
}

/**
 * One A4 page per ticketable item (or just `offerId`'s). Throws when nothing
 * qualifies, so a failed or refunded item can never come out looking valid.
 */
export async function buildTicketsPdf(
  tickets: TicketsResponse,
  opts: { offerId?: string; issuedAt?: Date } = {},
): Promise<Uint8Array> {
  const items = ticketableItems(tickets, opts.offerId);
  if (items.length === 0) throw new Error("No booked items to issue tickets for.");
  const issued = opts.issuedAt ?? new Date();

  const doc = await PDFDocument.create();
  doc.setTitle(`Tripweave trip documents - ${pdfFileRef(tickets, items)}`);
  doc.setAuthor("Tripweave");
  doc.setSubject("Sandbox booking - not valid for travel");
  doc.setCreator("Tripweave");
  doc.setProducer("Tripweave");
  doc.setCreationDate(issued);
  doc.setModificationDate(issued);

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.CourierBold),
  };

  for (const [i, item] of items.entries()) {
    const png = await QRCode.toBuffer(item.qr, {
      type: "png",
      margin: 1,
      width: 360,
      errorCorrectionLevel: "M",
      color: { dark: "#18201bff", light: "#fbf9f4ff" },
    });
    const qr = await doc.embedPng(png);
    const page = doc.addPage([W, H]);
    drawTicketPage(new Painter(page, fonts), { tickets, item, qr, issued, index: i + 1, count: items.length });
  }

  return doc.save();
}
