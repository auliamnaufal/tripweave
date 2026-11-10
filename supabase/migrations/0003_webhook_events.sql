-- Every PayPal webhook delivery, keyed by PayPal's own event id. PayPal
-- retries until it gets a 2xx, so the same event can arrive more than once:
-- the primary key is what makes handling it exactly once possible.
-- Server-only: RLS on, no policies.

create table webhook_events (
  event_id text primary key,
  event_type text not null,
  resource_id text,
  -- The plan quote id we set as custom_id on every purchase unit.
  quote_id uuid references plan_quotes (id) on delete set null,
  payload jsonb not null,
  outcome text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index webhook_events_quote_id_idx on webhook_events (quote_id);

alter table webhook_events enable row level security;
