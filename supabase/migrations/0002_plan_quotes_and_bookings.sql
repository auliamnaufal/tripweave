-- Server-held price snapshots and booking outcomes.
--
-- A plan quote is the itinerary exactly as the server priced it in
-- /api/plan. PayPal orders are created from a quote, and capture/booking
-- reads its offers from here, so the browser can never change what is
-- charged, who gets paid, or what gets booked. Both tables have RLS on and
-- no policies: only the server (secret-key admin client) reads or writes them.

create table plan_quotes (
  id uuid primary key default gen_random_uuid(),
  -- Null for a guest. When set, only that user may pay or capture the quote.
  user_id uuid references auth.users (id) on delete set null,
  brief jsonb not null,
  -- TravelOffer[] as priced by the server, including any Onboarded Supplier payee.
  offers jsonb not null,
  total_minor_units integer not null check (total_minor_units >= 0),
  currency text not null default 'USD',
  -- quoted -> ordered -> capturing -> completed
  -- needs_attention: money was captured but booking or reconciliation broke;
  -- someone has to look at it before anything else happens.
  status text not null default 'quoted'
    check (status in ('quoted', 'ordered', 'capturing', 'completed', 'needs_attention')),
  paypal_order_id text unique,
  approve_url text,
  -- Earliest expiry among the offers. No PayPal order is created after this.
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index plan_quotes_user_id_created_at_idx on plan_quotes (user_id, created_at desc);

-- One row per paid offer: the durable record of what happened to it.
create table bookings (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references plan_quotes (id) on delete cascade,
  offer_id text not null,
  product_kind text not null check (product_kind in ('flight', 'hotel', 'activity')),
  supplier text not null,
  amount_minor_units integer not null check (amount_minor_units >= 0),
  -- pending: queued for a Supplier Booking. paid_direct: settled to an
  -- Onboarded Supplier's own PayPal account, no booking needed.
  status text not null default 'pending'
    check (status in ('pending', 'booked', 'failed', 'paid_direct')),
  booking_ref text,
  failure_reason text,
  capture_id text,
  capture_status text,
  refund_id text,
  refund_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, offer_id)
);

alter table plan_quotes enable row level security;
alter table bookings enable row level security;
