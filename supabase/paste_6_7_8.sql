-- ============================================================
-- Vendra slices 6+7+8 — ONE paste for the Supabase SQL Editor
-- generated 2026-10-03, order: 0007 -> 0008 -> 0009 -> 0010
-- ============================================================
--
-- ===== 0007_payments_orders.sql =====
--
-- Slice 6-7: addresses, payments, orders, order_items, order_events
-- docs/architecture.md Â§1 (data model), Â§2 (RLS: own reads, service-only writes)
-- Timing sync (owner, 2026-10-03): ships_at = created_at + 15 minutes,
-- delivered_at = created_at + 2 hours â€” full lifecycle visible in a demo.

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
-- no INSERT/UPDATE policy: service-role writes only (architecture Â§2)

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

-- Derived status helper (architecture Â§1): read-only, computed from
-- timestamps â€” never a client-supplied value. UI mirrors this in
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

--
-- ===== 0008_place_order.sql =====
--
-- Slice 6: place_order â€” the one checkout transaction (architecture Â§5).
-- SECURITY DEFINER, service-role-only (ADR-017): REVOKE from PUBLIC/anon/
-- authenticated, GRANT only to service_role. user_id comes from the
-- server-verified session, never auth.uid(). No p_items and no amounts â€”
-- the function reads the user's cart itself and recomputes every cent.

create or replace function public.place_order(
  p_payment_id uuid,
  p_address jsonb,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_order_id uuid;
  v_ids uuid[];
  v_qty integer[];
  v_titles text[];
  v_units integer[];
  v_subtotal integer := 0;
  v_shipping integer;
  v_tax integer;
  v_total integer;
  i integer;
begin
  if p_user_id is null then
    raise exception 'no user';
  end if;
  if p_address is null or jsonb_typeof(p_address) <> 'object' or p_address = '{}'::jsonb then
    raise exception 'address required';
  end if;

  -- 1. Lock + verify the payment row (FOR UPDATE serialises double submits:
  --    concurrent callers queue here, then the existence check below returns
  --    the already-created order).
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment not found';
  end if;
  if v_payment.user_id <> p_user_id then
    raise exception 'payment belongs to another user';
  end if;
  if v_payment.status <> 'succeeded' then
    raise exception 'payment not succeeded';
  end if;
  if now() >= v_payment.expires_at then
    raise exception 'payment expired';
  end if;

  -- Idempotency: payment already processed -> return the existing order.
  select id into v_order_id from public.orders where payment_id = p_payment_id;
  if found then
    return v_order_id;
  end if;

  -- 2. Read the user's cart itself; compute every amount server-side
  --    (effective price per line, free shipping >= 3500c else 599c, tax 8%).
  select
    coalesce(array_agg(ci.product_id order by ci.product_id), '{}'),
    coalesce(array_agg(ci.qty order by ci.product_id), '{}'),
    coalesce(array_agg(p.title order by ci.product_id), '{}'),
    coalesce(array_agg(effective_price_cents(p.price_cents, p.discount_pct) order by ci.product_id), '{}')
    into v_ids, v_qty, v_titles, v_units
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.user_id = p_user_id;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'empty cart';
  end if;

  for i in 1..array_length(v_ids, 1) loop
    v_subtotal := v_subtotal + v_units[i] * v_qty[i];
  end loop;
  v_shipping := case when v_subtotal >= 3500 then 0 else 599 end;
  v_tax := round(v_subtotal * 0.08);
  v_total := v_subtotal + v_shipping + v_tax;
  if v_total <> v_payment.amount_cents then
    raise exception 'amount mismatch';
  end if;

  -- 3. Lock products FOR UPDATE in deterministic id order; re-check stock.
  perform 1 from public.products where id = any (v_ids) order by id for update;
  if exists (
    select 1
    from (select unnest(v_ids) as pid, unnest(v_qty) as q) req
    join public.products p on p.id = req.pid
    where p.stock < req.q
  ) then
    raise exception 'insufficient stock';
  end if;

  -- 4. Insert the order (payment_id UNIQUE = idempotency key).
  insert into public.orders (
    user_id, status, ships_at, delivered_at,
    subtotal_cents, shipping_cents, tax_cents, total_cents,
    ship_address, payment_id
  ) values (
    p_user_id, 'placed',
    now() + interval '15 minutes',
    now() + interval '2 hours',
    v_subtotal, v_shipping, v_tax, v_total,
    p_address, p_payment_id
  ) returning id into v_order_id;

  -- 5. Order items (effective-price snapshot) + placed event.
  for i in 1..array_length(v_ids, 1) loop
    insert into public.order_items (order_id, product_id, title_snapshot, unit_price_cents, qty)
    values (v_order_id, v_ids[i], v_titles[i], v_units[i], v_qty[i]);
  end loop;
  insert into public.order_events (order_id, status) values (v_order_id, 'placed');

  -- 6. Decrement stock (rows already locked).
  for i in 1..array_length(v_ids, 1) loop
    update public.products set stock = stock - v_qty[i] where id = v_ids[i];
  end loop;

  -- 7. Clear the user's cart. COMMIT happens implicitly â€” any failure
  --    above rolled back everything (no partial writes).
  delete from public.cart_items where user_id = p_user_id;

  return v_order_id;
end;
$$;

revoke all on function public.place_order(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.place_order(uuid, jsonb, uuid) to service_role;

--
-- ===== 0009_orders_rls.sql =====
--
-- Slice 7: own-row reads for orders/order_items/order_events + cancel_order
-- (architecture Â§6, ADR-017). cancel_order: owner only, only while effective
-- status = placed (before ships_at), idempotent (second call = clean no-op,
-- never a double restock), restores stock ordered by product id, payment ->
-- refunded. EXECUTE revoked except service_role.

create policy "orders_select_own" on public.orders
  for select using (auth.uid() = user_id);

create policy "order_items_select_own" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
  );

create policy "order_events_select_own" on public.order_events
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
  );

create or replace function public.cancel_order(
  p_order_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_user_id is null then
    raise exception 'no user';
  end if;

  -- 1. Lock the order; owner check.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  if v_order.user_id <> p_user_id then
    raise exception 'not your order';
  end if;

  -- 2. Idempotent: already cancelled -> clean no-op, no writes, no restock.
  if v_order.status = 'cancelled' then
    return;
  end if;

  -- 3. Effective status must still be placed (before ships_at).
  if now() >= v_order.ships_at then
    raise exception 'already shipped';
  end if;

  -- 4. Cancel + event.
  update public.orders set status = 'cancelled', cancelled_at = now()
    where id = p_order_id;
  insert into public.order_events (order_id, status) values (p_order_id, 'cancelled');

  -- 5. Restore stock, deterministic product-id order (deadlock-safe).
  for r in
    select oi.product_id, oi.qty
      from public.order_items oi
     where oi.order_id = p_order_id
     order by oi.product_id
  loop
    update public.products set stock = stock + r.qty where id = r.product_id;
  end loop;

  -- 6. Payment becomes refunded. COMMIT implicitly.
  update public.payments set status = 'refunded' where id = v_order.payment_id;
end;
$$;

revoke all on function public.cancel_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_order(uuid, uuid) to service_role;

--
-- ===== 0010_reviews.sql =====
--
-- Slice 8: reviews â€” buyer-only (server derives the eligible non-cancelled
-- order; client sends {productId, rating, body} and nothing else), one review
-- per (product, user), rollup trigger = seed baseline + real reviews
-- (ADR-018). add_review is service-role-only (ADR-017).

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text not null default '' check (length(body) <= 2000),
  created_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create index if not exists reviews_product_id_idx on public.reviews (product_id);
alter table public.reviews enable row level security;

create policy "reviews_public_select" on public.reviews
  for select using (true);
create policy "reviews_delete_own" on public.reviews
  for delete using (auth.uid() = user_id);
-- no INSERT policy: inserts only through add_review (server, service role).
-- no UPDATE policy: no edit feature exists; denying keeps the unique pair and
-- the verified order link immutable (plan Task 1 wins over architecture Â§2 row).

create or replace function public.add_review(
  p_product_id uuid,
  p_rating integer,
  p_body text,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if p_user_id is null then
    raise exception 'no user';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be 1-5';
  end if;
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'body required';
  end if;
  if length(p_body) > 2000 then
    raise exception 'body too long';
  end if;

  -- Server derives the eligible order: the user's most recent NON-cancelled
  -- order containing this product. No orderId ever comes from the client.
  select o.id into v_order_id
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
   where o.user_id = p_user_id
     and oi.product_id = p_product_id
     and o.status <> 'cancelled'
   order by o.created_at desc
   limit 1;

  if v_order_id is null then
    raise exception 'not a verified buyer';
  end if;

  -- unique (product_id, user_id) backstops duplicates -> unique_violation (409);
  -- check constraints backstop rating/body -> check_violation (400).
  insert into public.reviews (product_id, user_id, order_id, rating, body)
  values (p_product_id, p_user_id, v_order_id, p_rating, trim(p_body));
end;
$$;

revoke all on function public.add_review(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.add_review(uuid, integer, text, uuid) to service_role;

-- Rollup trigger: full recompute from rows on every insert/delete (never
-- incremental drift). rating_* = seed baseline + real reviews (ADR-018).
create or replace function public.reviews_rollup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid;
  v_seed_count integer;
  v_seed_avg numeric(3, 2);
  v_real_count integer;
  v_real_sum numeric;
begin
  v_pid := coalesce(new.product_id, old.product_id);
  if v_pid is null then
    return null;
  end if;

  select seed_rating_count, seed_rating_avg
    into v_seed_count, v_seed_avg
    from public.products
   where id = v_pid;
  if not found then
    return null;
  end if;

  select count(*), coalesce(sum(rating), 0)::numeric
    into v_real_count, v_real_sum
    from public.reviews
   where product_id = v_pid;

  update public.products
     set rating_count = v_seed_count + v_real_count,
         rating_avg = case
           when v_seed_count + v_real_count = 0 then v_seed_avg
           else round((v_seed_avg * v_seed_count + v_real_sum)
                      / (v_seed_count + v_real_count), 2)
         end
   where id = v_pid;
  return null;
end;
$$;

drop trigger if exists trg_reviews_rollup on public.reviews;
create trigger trg_reviews_rollup
after insert or update or delete on public.reviews
for each row execute function public.reviews_rollup();

