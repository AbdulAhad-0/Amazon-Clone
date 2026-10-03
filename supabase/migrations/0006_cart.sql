-- 0006: cart_items — signed-in cart, own-row RLS, UNIQUE(user_id, product_id);
--        cart_merges — idempotency markers so a guest-cart merge can run twice safely
create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  qty int not null check (qty >= 1 and qty <= 30),
  added_at timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table public.cart_items enable row level security;

drop policy if exists "cart_select_own" on public.cart_items;
create policy "cart_select_own" on public.cart_items
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "cart_insert_own" on public.cart_items;
create policy "cart_insert_own" on public.cart_items
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "cart_update_own" on public.cart_items;
create policy "cart_update_own" on public.cart_items
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "cart_delete_own" on public.cart_items;
create policy "cart_delete_own" on public.cart_items
  for delete to authenticated using (user_id = (select auth.uid()));

create index if not exists cart_items_user_idx on public.cart_items (user_id);

create table if not exists public.cart_merges (
  user_id uuid not null references auth.users (id) on delete cascade,
  merge_id text not null,
  applied_at timestamptz not null default now(),
  primary key (user_id, merge_id)
);

alter table public.cart_merges enable row level security;

drop policy if exists "cart_merges_select_own" on public.cart_merges;
create policy "cart_merges_select_own" on public.cart_merges
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "cart_merges_insert_own" on public.cart_merges;
create policy "cart_merges_insert_own" on public.cart_merges
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "cart_merges_delete_own" on public.cart_merges;
create policy "cart_merges_delete_own" on public.cart_merges
  for delete to authenticated using (user_id = (select auth.uid()));
