// Client-safe ticket shapes: no server imports, so the Tickets page can use
// them while the loader and PDF builder stay server-only.

export type TicketItem = {
  offerId: string;
  kind: "flight" | "hotel" | "activity";
  title: string;
  summary: string;
  startsAt: string;
  endsAt: string;
  costMinorUnits: number;
  platform: { supplier: string; label: string; data: "live" | "simulated" };
  status: "booked" | "failed" | "paid_direct" | "pending";
  bookingRef: string | null;
  failureReason: string | null;
  refunded: boolean;
  /** The offer's own cancellation text, as the supplier search returned it. */
  cancellationTerms: string | null;
  /** What the ticket's QR encodes: references only, never personal data. */
  qr: string;
};

export type TicketsResponse = {
  orderId: string;
  status: string;
  paidMinorUnits: number;
  travellers: { firstName: string; lastName: string }[];
  items: TicketItem[];
};

/** Only an item the supplier holds (or was paid for directly) gets a ticket. */
export function isTicketable(item: Pick<TicketItem, "status" | "refunded">): boolean {
  return (item.status === "booked" || item.status === "paid_direct") && !item.refunded;
}
