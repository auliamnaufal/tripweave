import type { TicketItem, TicketsResponse } from "./types";

// Sample tickets for tests and for rendering a preview PDF by hand.
const item = (overrides: Partial<TicketItem> & Pick<TicketItem, "offerId" | "kind" | "title">): TicketItem => ({
  summary: "",
  startsAt: "2026-12-10T06:58:00-08:00",
  endsAt: "2026-12-11T11:31:00+09:00",
  costMinorUnits: 10000,
  platform: { supplier: "synthetic", label: "Local operators", data: "simulated" },
  status: "booked",
  bookingRef: `SIM-SYNTHETIC-${overrides.offerId}`,
  failureReason: null,
  refunded: false,
  cancellationTerms: null,
  qr: `TRIPWEAVE|ORDER-1|${overrides.offerId}|SIM`,
  ...overrides,
});

export const sampleTickets: TicketsResponse = {
  orderId: "5O190127TN364715T",
  status: "completed",
  paidMinorUnits: 129852,
  travellers: [
    { firstName: "Mara", lastName: "Okafor" },
    { firstName: "Daniel", lastName: "Reyes" },
  ],
  items: [
    item({
      offerId: "flight-outbound-0",
      kind: "flight",
      title: "CGK to NRT, 1 stop",
      summary: "Duffel Airways flight, 2 segment(s).",
      startsAt: "2026-12-10T06:58:00+07:00",
      endsAt: "2026-12-10T19:31:00+09:00",
      costMinorUnits: 39852,
      platform: { supplier: "duffel", label: "Duffel", data: "live" },
      bookingRef: "SIM-DUFFEL-flight-outbound-0",
      cancellationTerms: "Subject to fare rules at booking; not confirmed by this search.",
    }),
    item({
      offerId: "hotel-lite-1",
      kind: "hotel",
      title: "Hotel Gracery Shinjuku",
      summary: "4★ · rated 8.6 (2140 reviews) · 1-19-1 Kabukicho, Shinjuku · Standard Double, Room only · 4 nights",
      startsAt: "2026-12-10T00:00:00Z",
      endsAt: "2026-12-14T00:00:00Z",
      costMinorUnits: 66000,
      platform: { supplier: "liteapi", label: "LiteAPI", data: "live" },
      bookingRef: "SIM-LITEAPI-hotel-lite-1",
      cancellationTerms: "Free cancellation until 7 Dec 2026.",
    }),
    item({
      offerId: "activity-3-wish-mount-fuji",
      kind: "activity",
      title: "Mount Fuji day trip",
      summary: "A guided day trip to the Fuji Five Lakes.",
      startsAt: "2026-12-12T08:00:00+09:00",
      endsAt: "2026-12-12T17:00:00+09:00",
      costMinorUnits: 24000,
      status: "failed",
      bookingRef: null,
      failureReason: "Sold out",
      refunded: true,
    }),
  ],
};
