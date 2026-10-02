# Slice 1 — Seeded Catalogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (execute inline, task-by-task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 194 real DummyJSON products with real photos live in Supabase across 8–10 **slugged** nav groups, loaded by an idempotent **upsert-on-slug** seeder with a documented rating baseline.

**Architecture:** one-shot `scripts/fetch-seed.ts` pulls DummyJSON → writes `data/seed-products.json` (committed); `scripts/seed.ts` loads the JSON with the service-role key via **upsert on `slug`** (stable ids — re-runs never change ids other tables reference). Categories collapse 24 → 8–10 nav groups at fetch time; nav groups are rows in `nav_groups` with slugs.

**Tech Stack:** TypeScript scripts (tsx), `@supabase/supabase-js` (admin), Supabase migrations (SQL).

**Spec:** `docs/architecture.md` §1 §10 §12; `docs/decisions.md` ADR-005/006/008/020; `docs/spec.md` F1.

## Global Constraints

- Money integer cents, server-computed (ADR-004) — prices converted at fetch time: `price_cents = round(price*100)`; `discount_pct` from source (0 if absent).
- Never read/print/log `.env*` — scripts read env via `process.env` at runtime only; never print values.
- Never claim seed succeeded without running the count script and seeing output (ADR-013).
- No duplicated products / synthetic variants (ADR-005); **upsert on slug only** — no delete-all.
- Image URLs: keep `cdn.dummyjson.com` as-is; no download over 10 MB (ADR-006).
- **Integration tests run against a SEPARATE Supabase test project** (`TEST_SUPABASE_*` env names) — never the demo project (ADR-020).
- **Windows-safe commands only** (`Select-String`, Node scripts); **screenshots/output → `docs/evidence/`** (ADR-020).

## Review Focus

- Product count matches source: script asserts 194 rows (or documents any API diff).
- Every product has ≥1 image row and every URL is `https://cdn.dummyjson.com/…`.
- Prices are integers in cents (`Number.isInteger(price_cents)`).
- Nav groups: 8–10 rows in `nav_groups`, each with a **slug**; every category has a `nav_group_id`.
- **Re-run stability:** `npm run seed` twice → identical row counts **and identical ids**
  (upsert proof: select `min(id), max(id)` before/after — unchanged).
- Rating baseline: `seed_rating_avg/seed_rating_count` populated; `rating_avg/rating_count`
  initialized equal to baseline (documented formula in architecture §12).
- Service-role key never in client bundle — `Select-String -Path app,components -Pattern SERVICE_ROLE -Recurse` → no matches.

---

### Task 1: Schema migrations

**Files:**
- Create: `supabase/migrations/0001_nav_groups.sql`, `0002_categories.sql`, `0003_products.sql`, `0004_rls_readonly.sql`

**Interfaces:**
- Produces: tables `nav_groups, categories, products, product_images` per architecture §1; public SELECT, service-only writes.

- [ ] **Step 1:** `0001_nav_groups`: `nav_groups(id uuid PK default gen_random_uuid(), slug text unique not null, name text not null, sort_order int)`.
- [ ] **Step 2:** `0002_categories`: `categories(id uuid PK, slug unique, name, nav_group_id → nav_groups, sort_order)`.
- [ ] **Step 3:** `0003_products`: `products(id uuid PK, slug unique, title, description, category_id, brand text` **nullable**`, price_cents int check > 0, discount_pct int check (0..100) default 0, stock int not null default 50,` **`seed_rating_avg numeric(3,2), seed_rating_count int`**, `rating_avg numeric(3,2) default 0, rating_count int default 0, created_at)`, `product_images(id, product_id references cascade, url, position)`, indexes per architecture §1.
  Also create the **single pricing function** every later slice must use (ADR-016):
  `CREATE FUNCTION effective_price_cents(p_price int, p_discount int) RETURNS int LANGUAGE sql IMMUTABLE …` → `p_price * (100 - coalesce(p_discount,0)) / 100` (integer division = floor); `GRANT EXECUTE … TO PUBLIC` (read-only helper — architecture §2).
- [ ] **Step 4:** `0004_rls_readonly`: enable RLS; `USING (true)` SELECT policies for anon+authenticated on all four; no write policies (service bypasses).
- [ ] **Step 5:** Apply: `npx supabase db push` (or SQL editor) → verify: `select count(*) from nav_groups;` Expected: 0 (fresh), no errors.
- [ ] **Step 6:** Commit.

### Task 2: One-shot fetch script

**Files:**
- Create: `scripts/fetch-seed.ts`, `data/nav-groups.ts` (the 24→group mapping table)

**Interfaces:**
- Produces: `data/seed-products.json` = `{ fetchedAt, navGroups: NavGroup[], categories: Category[], products: SeedProduct[] }` where `NavGroup = { slug, name, sortOrder }`, `Category = { slug, name, navGroupSlug, sortOrder }`, `SeedProduct = { slug, title, description, brand | null, categorySlug, priceCents, discountPct, seedRatingAvg, seedRatingCount, stock, images: string[] }`.

- [ ] **Step 1:** Write `data/nav-groups.ts`: nine groups **with slugs** — `electronics`, `home-kitchen`, `fashion`, `beauty`, `grocery`, `sports`, `toys`, `pets-automotive`, `furniture` — and a mapping of each of the 24 source category slugs to exactly one group slug; every source slug assigned.
- [ ] **Step 2:** `fetch-seed.ts`: `fetch('https://dummyjson.com/products?limit=200')`, map to `SeedProduct` (brand may be missing → `null`; rating → `seedRatingAvg/seedRatingCount`), **fail loudly** if `total !== products.length`.
- [ ] **Step 3: Run and verify**

```powershell
npx tsx scripts/fetch-seed.ts
node -e "const d=require('./data/seed-products.json');console.log(d.products.length,new Set(d.navGroups.map(g=>g.slug)).size,d.products.every(p=>Number.isInteger(p.priceCents)))"
```
Expected: `194 9 true`. Any other number → stop, report, do not proceed.

- [ ] **Step 4:** Confirm file size < 10 MB: `(Get-Item data/seed-products.json).Length`.
- [ ] **Step 5:** Commit `data/seed-products.json` + script.

### Task 3: Seed loader (upsert on slug, stable ids, rating baseline)

**Files:**
- Create: `scripts/seed.ts`; `package.json` script `"seed"`

**Interfaces:**
- Consumes: `data/seed-products.json`.
- Produces: rows in `nav_groups`, `categories`, `products`, `product_images` — **`upsert(..., { onConflict: 'slug' })`** at every level so re-runs keep ids stable.

- [ ] **Step 1:** `seed.ts`: service client (`SUPABASE_SERVICE_ROLE_KEY`), upsert nav groups → categories → products → images, each `onConflict: 'slug'` (images: delete+insert per product — they have no natural slug; keep `position` index).
- [ ] **Step 2:** **Rating baseline:** products upsert sets `seed_rating_avg`, `seed_rating_count` from source AND initializes `rating_avg = seed_rating_avg`, `rating_count = seed_rating_count` (first load only — on conflict do **not** overwrite derived `rating_*`, only `seed_*`). Print in README comment + `docs/progress.md`: `rating_avg/count = seed baseline + real reviews (trigger, Slice 8)`.
- [ ] **Step 3:** Add `"seed": "tsx scripts/seed.ts"` to `package.json`.
- [ ] **Step 4: Verify idempotence + baseline**

```powershell
npm run seed
# capture ids: node -e "...select min(id)::text, max(id)::text, count(*) from products... (via service call script)"
npm run seed
# re-run the same id/count capture
```
Expected: first print `categories=24 products=194 images>=194` + 9 nav-group lines; second run **identical counts AND identical min/max ids**; `seed_rating_count > 0` on at least one product.
(Use a small `scripts/verify-seed.ts` for the id/count capture — PowerShell alone can't query Postgres.)

- [ ] **Step 5:** Commit `feat: upsert-on-slug seed with rating baseline` + update `docs/progress.md` slice 1 with the verified counts.

### Task 4: Guardrails

**Files:**
- Create: `scripts/verify-public-read.ts`

- [ ] **Step 1:** `Select-String -Path app,components -Pattern SERVICE_ROLE -Include *.ts,*.tsx -Recurse` → no matches.
- [ ] **Step 2:** `scripts/verify-public-read.ts` uses only `NEXT_PUBLIC_*` vars → selects `title, price_cents from products limit 3` and prints the three titles.
Run: `npx tsx scripts/verify-public-read.ts`
Expected: 3 titles printed; any service-key reference → fail the step.
- [ ] **Step 3:** Commit any fix + docs.
