import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { toTravelOffer, travelOfferSchema, type TravelOffer } from "@/features/planner/travelOffer";
import type { TripBrief } from "@/features/planner/tripBrief";
import { quoteExpiry, quoteTotal, type BookingRecord, type BookingStatus, type PlanQuote, type QuoteStatus, type Traveller } from "./quote";

// Persistence for plan quotes and bookings. Server-only: both tables have RLS
// on with no policies, so only the secret-key admin client can reach them.

type QuoteRow = {
  id: string;
  user_id: string | null;
  offers: unknown;
  total_minor_units: number;
  status: QuoteStatus;
  paypal_order_id: string | null;
  approve_url: string | null;
  expires_at: string;
  brief: unknown;
  travellers: Traveller[] | null;
};

const QUOTE_COLUMNS = "id, user_id, brief, offers, travellers, total_minor_units, status, paypal_order_id, approve_url, expires_at";

// Offers are re-validated on the way out too: the database is a boundary.
const offersSchema = z.array(travelOfferSchema).min(1);

function toQuote(row: QuoteRow): PlanQuote {
  return {
    id: row.id,
    userId: row.user_id,
    offers: offersSchema.parse(row.offers).map(toTravelOffer),
    totalMinorUnits: row.total_minor_units,
    status: row.status,
    paypalOrderId: row.paypal_order_id,
    approveUrl: row.approve_url,
    expiresAt: row.expires_at,
    brief: row.brief,
    travellers: row.travellers ?? undefined,
  };
}

function fail(action: string, error: { message: string } | null): never {
  throw new Error(`plan quote ${action} failed: ${error?.message ?? "no row"}`);
}

export async function saveQuote(input: {
  userId: string | null;
  brief: TripBrief;
  offers: readonly TravelOffer[];
  /** The full catalog the plan was chosen from, so options can be swapped later without searching again. */
  catalog?: readonly TravelOffer[];
  insights?: unknown;
}): Promise<string> {
  const { data, error } = await createAdminClient()
    .from("plan_quotes")
    .insert({
      user_id: input.userId,
      brief: input.brief,
      offers: input.offers,
      total_minor_units: quoteTotal(input.offers),
      expires_at: quoteExpiry(input.offers),
      ...(input.catalog ? { catalog: input.catalog } : {}),
      ...(input.insights ? { insights: input.insights } : {}),
    })
    .select("id")
    .single();
  if (error || !data) fail("insert", error);
  return data.id as string;
}

/** The search snapshot saved with a quote (see saveQuote). Loaded only when swapping options. */
export async function getQuoteSnapshot(id: string): Promise<{ catalog: TravelOffer[]; insights: unknown } | null> {
  const { data, error } = await createAdminClient().from("plan_quotes").select("catalog, insights").eq("id", id).maybeSingle();
  if (error) fail("snapshot lookup", error);
  if (!data?.catalog) return null;
  return { catalog: offersSchema.parse(data.catalog).map(toTravelOffer), insights: data.insights ?? null };
}

export async function getQuote(id: string): Promise<PlanQuote | null> {
  const { data, error } = await createAdminClient().from("plan_quotes").select(QUOTE_COLUMNS).eq("id", id).maybeSingle();
  if (error) fail("lookup", error);
  return data ? toQuote(data as QuoteRow) : null;
}

export async function getQuoteByOrderId(paypalOrderId: string): Promise<PlanQuote | null> {
  const { data, error } = await createAdminClient()
    .from("plan_quotes")
    .select(QUOTE_COLUMNS)
    .eq("paypal_order_id", paypalOrderId)
    .maybeSingle();
  if (error) fail("lookup", error);
  return data ? toQuote(data as QuoteRow) : null;
}

/** quoted -> ordered. Returns false if another request already ordered it. */
export async function markOrdered(
  id: string,
  order: { paypalOrderId: string; approveUrl: string; offers: readonly TravelOffer[]; travellers?: readonly Traveller[] },
): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("plan_quotes")
    .update({
      status: "ordered",
      paypal_order_id: order.paypalOrderId,
      approve_url: order.approveUrl,
      offers: order.offers,
      ...(order.travellers ? { travellers: order.travellers } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "quoted")
    .select("id");
  if (error) fail("order update", error);
  return (data ?? []).length === 1;
}

/**
 * Atomically moves a quote from `from` to `to`. The conditional update is the
 * lock: of two concurrent captures, exactly one gets `true`.
 */
export async function transitionQuote(id: string, from: QuoteStatus, to: QuoteStatus): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("plan_quotes")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", from)
    .select("id");
  if (error) fail("status update", error);
  return (data ?? []).length === 1;
}

export async function setQuoteStatus(id: string, status: QuoteStatus): Promise<void> {
  const { error } = await createAdminClient()
    .from("plan_quotes")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail("status update", error);
}

export type BookingWrite = {
  offerId: string;
  status: BookingStatus;
  bookingRef?: string | null;
  failureReason?: string | null;
  captureId?: string | null;
  captureStatus?: string | null;
  refundId?: string | null;
  refundStatus?: string | null;
};

/** Upserts one row per offer, keyed by (quote_id, offer_id), so a retry never duplicates a booking. */
export async function writeBookings(quote: PlanQuote, writes: readonly BookingWrite[]): Promise<void> {
  if (writes.length === 0) return;
  const byId = new Map(quote.offers.map((offer) => [offer.id, offer]));
  const now = new Date().toISOString();
  const rows = writes.map((write) => {
    const offer = byId.get(write.offerId);
    if (!offer) throw new Error(`Booking for an offer outside quote ${quote.id}: ${write.offerId}`);
    return {
      quote_id: quote.id,
      offer_id: offer.id,
      product_kind: offer.productKind,
      supplier: offer.supplier,
      amount_minor_units: offer.costMinorUnits,
      status: write.status,
      updated_at: now,
      ...(write.bookingRef !== undefined ? { booking_ref: write.bookingRef } : {}),
      ...(write.failureReason !== undefined ? { failure_reason: write.failureReason } : {}),
      ...(write.captureId !== undefined ? { capture_id: write.captureId } : {}),
      ...(write.captureStatus !== undefined ? { capture_status: write.captureStatus } : {}),
      ...(write.refundId !== undefined ? { refund_id: write.refundId } : {}),
      ...(write.refundStatus !== undefined ? { refund_status: write.refundStatus } : {}),
    };
  });
  const { error } = await createAdminClient().from("bookings").upsert(rows, { onConflict: "quote_id,offer_id" });
  if (error) fail("booking write", error);
}

export async function listBookings(quoteId: string): Promise<BookingRecord[]> {
  const { data, error } = await createAdminClient()
    .from("bookings")
    .select("offer_id, status, amount_minor_units, booking_ref, failure_reason, refund_status")
    .eq("quote_id", quoteId);
  if (error) fail("booking lookup", error);
  return (data ?? []).map((row) => ({
    offerId: row.offer_id as string,
    status: row.status as BookingStatus,
    amountMinorUnits: row.amount_minor_units as number,
    bookingRef: (row.booking_ref as string | null) ?? null,
    failureReason: (row.failure_reason as string | null) ?? null,
    refundStatus: (row.refund_status as string | null) ?? null,
  }));
}

/**
 * Records a webhook delivery by PayPal event id. Returns false only when that
 * event was already fully processed: the caller acknowledges and skips it.
 * An event recorded earlier but never finished (the handler failed, PayPal
 * retried) returns true, so it does get processed.
 */
export async function recordWebhookEvent(event: { id: string; eventType: string; resourceId: string | null; payload: unknown }): Promise<boolean> {
  const client = createAdminClient();
  const { error } = await client
    .from("webhook_events")
    .upsert(
      { event_id: event.id, event_type: event.eventType, resource_id: event.resourceId, payload: event.payload },
      { onConflict: "event_id", ignoreDuplicates: true },
    );
  if (error) fail("webhook insert", error);
  const { data, error: readError } = await client.from("webhook_events").select("processed_at").eq("event_id", event.id).single();
  if (readError || !data) fail("webhook lookup", readError);
  return data.processed_at === null;
}

export async function markWebhookProcessed(eventId: string, outcome: string, quoteId: string | null): Promise<void> {
  const { error } = await createAdminClient()
    .from("webhook_events")
    .update({ outcome, quote_id: quoteId, processed_at: new Date().toISOString() })
    .eq("event_id", eventId);
  if (error) fail("webhook update", error);
}

/**
 * Every Trip Order a user has paid for (captured or being captured), newest
 * first, with each one's stored bookings. Feeds the Trip spend dashboard.
 */
export async function listPaidQuotesWithBookings(
  userId: string,
  limit = 50,
): Promise<{ quote: PlanQuote & { createdAt: string }; bookings: BookingRecord[] }[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("plan_quotes")
    .select(`${QUOTE_COLUMNS}, created_at`)
    .eq("user_id", userId)
    .in("status", ["capturing", "completed", "needs_attention"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("paid lookup", error);
  const rows = (data ?? []) as (QuoteRow & { created_at: string })[];
  if (rows.length === 0) return [];

  const { data: bookingRows, error: bookingError } = await db
    .from("bookings")
    .select("quote_id, offer_id, status, amount_minor_units, booking_ref, failure_reason, refund_status")
    .in(
      "quote_id",
      rows.map((row) => row.id),
    );
  if (bookingError) fail("booking lookup", bookingError);

  const byQuote = new Map<string, BookingRecord[]>();
  for (const row of bookingRows ?? []) {
    const list = byQuote.get(row.quote_id as string) ?? [];
    list.push({
      offerId: row.offer_id as string,
      status: row.status as BookingStatus,
      amountMinorUnits: row.amount_minor_units as number,
      bookingRef: (row.booking_ref as string | null) ?? null,
      failureReason: (row.failure_reason as string | null) ?? null,
      refundStatus: (row.refund_status as string | null) ?? null,
    });
    byQuote.set(row.quote_id as string, list);
  }

  return rows.map((row) => ({ quote: { ...toQuote(row), createdAt: row.created_at }, bookings: byQuote.get(row.id) ?? [] }));
}
