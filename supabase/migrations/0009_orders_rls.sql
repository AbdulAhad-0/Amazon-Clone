-- Slice 7: own-row reads for orders/order_items/order_events + cancel_order
-- (architecture §6, ADR-017). cancel_order: owner only, only while effective
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
