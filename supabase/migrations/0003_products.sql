-- 0003: products + product images + the single pricing function (ADR-016)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text not null default '',
  category_id uuid not null references public.categories(id),
  brand text,
  price_cents int not null check (price_cents > 0),
  discount_pct int not null default 0 check (discount_pct between 0 and 100),
  stock int not null default 50,
  seed_rating_avg numeric(3,2),
  seed_rating_count int,
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists products_category_id_idx
  on public.products (category_id);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  position int not null default 0
);

create index if not exists product_images_product_id_idx
  on public.product_images (product_id);

create or replace function public.effective_price_cents(p_price int, p_discount int)
returns int
language sql
immutable
parallel safe
as $$
  select p_price * (100 - coalesce(p_discount, 0)) / 100
$$;

grant execute on function public.effective_price_cents(int, int) to public;
