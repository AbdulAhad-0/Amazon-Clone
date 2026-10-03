-- Slice 6: place_order — the one checkout transaction (architecture §5).
-- SECURITY DEFINER, service-role-only (ADR-017): REVOKE from PUBLIC/anon/
-- authenticated, GRANT only to service_role. user_id comes from the
-- server-verified session, never auth.uid(). No p_items and no amounts —
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

  -- 7. Clear the user's cart. COMMIT happens implicitly — any failure
  --    above rolled back everything (no partial writes).
  delete from public.cart_items where user_id = p_user_id;

  return v_order_id;
end;
$$;

revoke all on function public.place_order(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.place_order(uuid, jsonb, uuid) to service_role;
