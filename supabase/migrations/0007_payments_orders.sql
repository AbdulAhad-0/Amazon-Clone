-- Slice 6-7: addresses, payments, orders, order_items, order_events
-- docs/architecture.md §1 (data model), §2 (RLS: own reads, service-only writes)
-- Timing sync (owner, 2026-10-03): ships_at = created_at + 15 minutes,
-- delivered_at = created_at + 2 hours — full lifecycle visible in a demo.

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (length(full_name) between 1 and 120),
  phone text not null check (length(phone) between 1 and 40),
  line1 text not null check (length(line1) between 1 and 200),
  line2 text,
  city text not null check (length(city) between 1 and 100),
  state text not null check (length(state) between 1 and 100),
  zip text not null check (length(zip) between 1 and 20),
  country text not null check (length(country) between 1 and 100),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.addresses enable row level security;
create policy "addresses_select_own" on public.addresses
  for select using (auth.uid() = user_id);
create policy "addresses_insert_own" on public.addresses
  for insert with check (auth.uid() = user_id);
create policy "addresses_update_own" on public.addresses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "addresses_delete_own" on public.addresses
  for delete using (auth.uid() = user_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists payments_user_id_idx on public.payments (user_id);
alter table public.payments enable row level security;
create policy "payments_select_own" on public.payments
  for select using (auth.uid() = user_id);
-- no INSERT/UPDATE policy: service-role writes only (architecture §2)

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'placed'
    check (status in ('placed', 'shipped', 'delivered', 'cancelled')),
  created_at timestamptz not null default now(),
  ships_at timestamptz not null,
  delivered_at timestamptz not null,
  cancelled_at timestamptz,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cents integer not null check (shipping_cents >= 0),
  tax_cents integer not null check (tax_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  ship_address jsonb not null,
  payment_id uuid not null unique references public.payments(id)
);
create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);
alter table public.orders enable row level security;
-- SELECT (own row) policy added in 0009 alongside cancel_order; RLS is ON
-- from here, so until then: no client reads at all (secure default).

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  title_snapshot text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  qty integer not null check (qty > 0)
);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);
alter table public.order_items enable row level security;

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null check (status in ('placed', 'cancelled')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on public.order_events (order_id);
alter table public.order_events enable row level security;

-- Derived status helper (architecture §1): read-only, computed from
-- timestamps — never a client-supplied value. UI mirrors this in
-- lib/orders.ts (PostgREST cannot call a function inside a select list).
create or replace function public.order_effective_status(
  p_status text,
  p_ships_at timestamptz,
  p_delivered_at timestamptz
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_status = 'cancelled' then 'cancelled'
    when now() >= p_delivered_at then 'delivered'
    when now() >= p_ships_at then 'shipped'
    else 'placed'
  end;
$$;
grant execute on function public.order_effective_status(text, timestamptz, timestamptz) to public;
