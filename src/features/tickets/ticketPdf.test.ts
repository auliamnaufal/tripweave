import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildTicketsPdf, flightFacts, flightRoute, localParts, pdfFileRef, ticketableItems } from "./ticketPdf";
import { sampleTickets } from "./fixtures";

const ascii = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes.slice(0, 5));

describe("buildTicketsPdf", () => {
  it("builds one A4 page per booked item and skips the failed, refunded one", async () => {
    const bytes = await buildTicketsPdf(sampleTickets, { issuedAt: new Date("2026-11-11T10:00:00Z") });
    expect(bytes.length).toBeGreaterThan(2000);
    expect(ascii(bytes)).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const { width, height } = doc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
    expect(doc.getSubject()).toMatch(/not valid for travel/i);
  });

  it("renders a single item when asked, and refuses an item that wasn't booked", async () => {
    const one = await PDFDocument.load(await buildTicketsPdf(sampleTickets, { offerId: "hotel-lite-1" }));
    expect(one.getPageCount()).toBe(1);
    await expect(buildTicketsPdf(sampleTickets, { offerId: "activity-3-wish-mount-fuji" })).rejects.toThrow();
  });

  it("issues a page for a direct supplier payment with no booking code", async () => {
    const direct = {
      ...sampleTickets,
      items: [{ ...sampleTickets.items[2], status: "paid_direct" as const, refunded: false, failureReason: null }],
    };
    const doc = await PDFDocument.load(await buildTicketsPdf(direct));
    expect(doc.getPageCount()).toBe(1);
  });

  it("never treats a refunded booking as ticketable", () => {
    const refunded = { ...sampleTickets, items: [{ ...sampleTickets.items[0], refunded: true }] };
    expect(ticketableItems(refunded)).toEqual([]);
  });
});

describe("ticket text helpers", () => {
  it("keeps the offer's own local time and offset", () => {
    expect(localParts("2026-12-10T06:58:00-08:00")).toMatchObject({ date: "Thu, 10 Dec 2026", time: "06:58", offset: "UTC-08:00" });
    expect(localParts("2026-12-12T08:00:00Z")).toMatchObject({ time: "08:00", offset: "UTC" });
  });

  it("reads route and carrier only when the data states them", () => {
    expect(flightRoute("CGK to NRT, 1 stop")).toEqual({ from: "CGK", to: "NRT", stops: "1 stop" });
    expect(flightRoute("Mount Fuji day trip")).toBeNull();
    expect(flightFacts("Garuda Indonesia flight, 2 segment(s).")).toEqual({ carrier: "Garuda Indonesia", segments: 2 });
    expect(flightFacts("Carrier flight, 1 segment(s).")).toEqual({ carrier: null, segments: 1 });
    expect(flightFacts("")).toEqual({ carrier: null, segments: null });
  });

  it("makes a filename-safe reference", () => {
    expect(pdfFileRef(sampleTickets, [sampleTickets.items[0]])).toBe("SIM-DUFFEL-flight-outbound-0");
    expect(pdfFileRef(sampleTickets, sampleTickets.items)).toBe("5O190127TN364715T");
  });
});
