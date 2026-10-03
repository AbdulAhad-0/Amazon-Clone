-- 0002: categories (24 source categories, each under exactly one nav group)
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  nav_group_id uuid not null references public.nav_groups(id),
  sort_order int not null default 0
);

create index if not exists categories_nav_group_id_idx
  on public.categories (nav_group_id);
