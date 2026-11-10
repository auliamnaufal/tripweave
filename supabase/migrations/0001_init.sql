-- Tripweave core schema. Every table is owned by a user_id and locked to
-- that owner via Row Level Security — no row is readable or writable by
-- anyone but its owner (or the secret-key admin client, which bypasses RLS
-- on purpose for server-only paths with no logged-in user, e.g. the PayPal
-- capture route).

create extension if not exists pgcrypto;

-- One row per auth.users row, auto-created on signup (trigger below).
-- Mirrors the DEMO_USER shape the UI already renders.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  avatar_url text,
  home_airport text,
  member_since timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per planned trip. "Recent plans" and "current plan" (Account.tsx)
-- are just this table ordered by updated_at — no separate history table.
create table trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  dest_id text not null,
  title text not null,
  prefs jsonb not null,
  plan jsonb,
  is_live boolean not null default false,
  source text,
  status text not null default 'draft',
  total_minor_units integer,
  budget_minor_units integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index trips_user_id_updated_at_idx on trips (user_id, updated_at desc);

-- The planner chat transcript. Not every scripted UI block (typing
-- indicators, inline cards) — just the actual text turns, enough to show
-- "here's what we discussed" on return.
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid references trips (id) on delete cascade,
  role text not null check (role in ('user', 'agent')),
  kind text,
  text text not null,
  created_at timestamptz not null default now()
);
create index chat_messages_trip_id_idx on chat_messages (trip_id, created_at);

-- Mirrors tripStore's Order type, plus the real PayPal order id.
create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid references trips (id) on delete set null,
  label text not null,
  paypal_order_id text,
  title text not null,
  dest_id text not null,
  total_minor_units integer not null,
  items integer not null default 0,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);
create index orders_user_id_created_at_idx on orders (user_id, created_at desc);

create table saved_destinations (
  user_id uuid not null references auth.users (id) on delete cascade,
  dest_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, dest_id)
);

alter table profiles enable row level security;
alter table trips enable row level security;
alter table chat_messages enable row level security;
alter table orders enable row level security;
alter table saved_destinations enable row level security;

create policy "profiles: owner full access" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "trips: owner full access" on trips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "chat_messages: owner full access" on chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "orders: owner full access" on orders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "saved_destinations: owner full access" on saved_destinations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-create a profile row the moment someone signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
