-- 0004: RLS — public SELECT only; no write policies (service role bypasses RLS)
alter table public.nav_groups enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;

drop policy if exists "public read" on public.nav_groups;
create policy "public read" on public.nav_groups
  for select to anon, authenticated using (true);

drop policy if exists "public read" on public.categories;
create policy "public read" on public.categories
  for select to anon, authenticated using (true);

drop policy if exists "public read" on public.products;
create policy "public read" on public.products
  for select to anon, authenticated using (true);

drop policy if exists "public read" on public.product_images;
create policy "public read" on public.product_images
  for select to anon, authenticated using (true);
