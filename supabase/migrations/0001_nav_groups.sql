-- 0001: nav groups (8-10 slugged top-level nav rows; seed supplies 9)
create table if not exists public.nav_groups (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  sort_order int not null default 0
);
