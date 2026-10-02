# Slice 2 — Browse + Product Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (execute inline, task-by-task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shoppers can reach the home page, a nav-group **slug** category page and a product detail page — each with loading, empty and error states and image fallbacks.

**Architecture:** server components query Supabase (anon, RLS-public reads); routes under `app/(shop)/` with **async params** (`await params` — ADR-019); product images wrapped in one `<ProductImage>` component that swaps to a branded tile on error; `next/image` configured with `remotePatterns` for `cdn.dummyjson.com` + `unoptimized: true`.

**Tech Stack:** Next.js App Router server components, `@supabase/supabase-js`, Tailwind + shadcn/ui, `next/image`.

**Spec:** `docs/spec.md` F1 + §2; `docs/architecture.md` §1 §7 §9.

## Global Constraints

- Money: render only from `price_cents`/effective price via `lib/money.ts` (`formatCents`), never client math (ADR-004).
- No Amazon branding; accent `#3B3FA8`, no orange/teal (ADR-001/002).
- noindex already inherited from root layout — do not override per-route (ADR-002).
- Every data surface ships skeleton + empty + error state (spec F1).
- Brand line hidden when `brand` is null (spec F1).
- All dynamic route params are Promises — `const { group } = await params` (ADR-019).
- **Windows-safe commands only; screenshots/output → `docs/evidence/`** (ADR-020).
- Never claim a route works without running `npm run build` and opening it (ADR-013).

## Review Focus

- Broken/missing CDN image → branded tile, never a broken icon (spec F1 AC).
- Price rendering: `1299 → $12.99`, `0 → $0.00`, no float math anywhere (test `lib/money`).
- Unknown slug → 404 page, not a crash; nav-group routes use **slugs** (`/c/electronics`), unknown group → 404.
- Category with zero products (edge) → empty state with link home.
- Pagination out of range (`?page=999`) → empty state, HTTP 200.
- Product with `brand: null` → no brand line rendered (pick one from seed).

---

### Task 1: money + image primitives (incl. `next/image` config)

**Files:**
- Create: `lib/money.ts`, `tests/money.test.ts`, `components/shop/ProductImage.tsx`
- Modify: `next.config.ts` — add

```ts
images: { remotePatterns: [{ protocol: 'https', hostname: 'cdn.dummyjson.com' }], unoptimized: true }
```

**Interfaces:**
- Produces: `formatCents(cents: number): string` → `"$1,299.00"`; `parseDollarsToCents(input: string): number`.

- [ ] **Step 1 (failing test):** `tests/money.test.ts` — `formatCents(1299) === '$12.99'`, `formatCents(0) === '$0.00'`, `parseDollarsToCents('12.99') === 1299`, `parseDollarsToCents('') === 0`.
- [ ] **Step 2:** Run `npx vitest run tests/money.test.ts` → Expected FAIL (module missing).
- [ ] **Step 3:** Implement `lib/money.ts`.
- [ ] **Step 4:** Run again → PASS. Commit `feat: money formatting`.
- [ ] **Step 5:** `next.config.ts` image config (ADR-019) — `remotePatterns` **and** `unoptimized: true`.
- [ ] **Step 6:** `ProductImage`: aspect box, `next/image`, `onError` → indigo fallback tile with product initial. Manual check on home (Task 2).

### Task 2: Home page

**Files:**
- Create: `app/(shop)/page.tsx`, `components/shop/NavGroupGrid.tsx`, `components/shop/ProductCard.tsx`, `components/shop/Skeletons.tsx`

**Interfaces:**
- Consumes: `nav_groups`, `categories`, `products` tables.
- Produces: `<ProductCard product={…}>` used by category page and related rows; nav-group cards link to `/c/[slug]`.

- [ ] **Step 1:** Server component: hero headline (serif display token) + grid of nav-group cards (image tile per group = first product image in that group) + one curated row "Popular right now" (`order by rating_count desc limit 8`).
- [ ] **Step 2:** `loading.tsx` → skeletons; `error.tsx` → retry card.
- [ ] **Step 3:** Run `npm run dev` → screenshot to `docs/evidence/02-home.png`; verify no orange/teal, no layout shift on images.
- [ ] **Step 4:** Commit `feat: home page`.

### Task 3: Category page (nav-group slug route, async params)

**Files:**
- Create: `app/(shop)/c/[group]/page.tsx`, `app/(shop)/c/[group]/loading.tsx`, `app/(shop)/not-found.tsx`

**Interfaces:**
- Produces: route `/c/[group]?page=1` where `[group]` is a **nav_groups.slug** (e.g. `/c/electronics`) — paginated grid (24/page) via `nav_group_id`; `count` for the heading.

- [ ] **Step 1:** `export default async function Page({ params, searchParams }: { params: Promise<{ group: string }>, searchParams: Promise<…> })` — **await both** (ADR-019). Look up nav group by slug; unknown slug → `notFound()`; `page` out of range → empty state (200).
- [ ] **Step 2:** Query products where `categories.nav_group_id = <id>`, join images, paginate; heading shows group name + result count; `<ProductCard>` grid; pagination links preserve `page`.
- [ ] **Step 3:** Verify manually: `/c/electronics` shows items + count; `/c/nope` → 404 page; `/c/electronics?page=999` → empty state. Screenshot → `docs/evidence/02-category.png`.
- [ ] **Step 4:** Commit `feat: category listing (slug route)`.

### Task 4: Product detail page (async params, multi-image gallery)

**Files:**
- Create: `app/(shop)/p/[slug]/page.tsx`, `loading.tsx`, `error.tsx`, `components/shop/BuyBox.tsx`, `components/shop/Gallery.tsx`

**Interfaces:**
- Produces: `/p/[slug]` — gallery (all `product_images` by position), title, brand (hidden when null), `formatCents(price)`, discount badge if `discount_pct > 0`, stock line, `BuyBox` (qty stepper + **Add to cart** button, disabled when `stock = 0`, no-op stub until Slice 5), rating summary row, description, related row (same nav group, limit 8).

- [ ] **Step 1:** Implement route with `params: Promise<{ slug: string }>` + `await params`; `generateMetadata` (title only; noindex inherited).
- [ ] **Step 2:** Unknown slug → `notFound()`; DB error → `error.tsx`.
- [ ] **Step 3: Generic multi-image check** — find any product with >1 image from the DB (do **not** hardcode a title):
  `node -e "…select p.title, count(i.id) from products p join product_images i on i.product_id=p.id group by p.id having count(i.id)>1 limit 1…"` (small script) → open that slug; gallery switches between images. Also open a product with `brand is null` → no brand line.
  Block `cdn.dummyjson.com` in devtools → fallback tile appears. Screenshot → `docs/evidence/02-pdp.png`.
- [ ] **Step 4:** `npm run build` → success. Commit `feat: product detail page`.

### Task 5: Slice verification

- [ ] **Step 1:** `npm run lint && npx tsc --noEmit && npx vitest run && npm run build` → all clean.
- [ ] **Step 2:** Click-path evidence: home → category → PDP — screenshots saved to `docs/evidence/` (never `.agent-logs/`).
- [ ] **Step 3:** Update `docs/progress.md` (slice 2 → DONE with commands). Commit.
