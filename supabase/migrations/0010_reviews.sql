-- Slice 8: reviews — buyer-only (server derives the eligible non-cancelled
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
-- the verified order link immutable (plan Task 1 wins over architecture §2 row).

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
