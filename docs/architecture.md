# Vendra — Architecture

**Stack:** Next.js App Router + TypeScript strict · Supabase (Auth, Postgres + RLS, Storage) ·
Tailwind + shadcn/ui · Vercel. No separate server. Tests: Vitest (against a **separate** Supabase
test project).

**Next.js convention:** the app is scaffolded on the current stable Next (16.x) — the guard file is
**`proxy.ts`** (`export default function proxy(...)`); `middleware.ts` is deprecated as of Next 16
(ADR-019). If the scaffolded version turns out to be 15.x, use `middleware.ts` instead — Slice 0
checks `next --version` first. Dynamic route params are **async** (`const { slug } = await params`).

---

## 1. Data model

All money: `*_cents INTEGER` (USD, ASSUMPTION). Timestamps: `timestamptz`.

| Table | Columns (key ones) | Notes |
|---|---|---|
| `profiles` | `id uuid PK → auth.users`, `display_name`, `created_at` | Row created by trigger on sign-up; `display_name` = signup name field or email prefix |
| `nav_groups` | `id`, `slug` unique (e.g. `electronics`), `name`, `sort_order` | 6 groups (ADR-021 + furniture merge); slugs drive `/c/[group]` routes |
| `categories` | `id`, `slug` unique, `name`, `nav_group_id → nav_groups`, `sort_order` | 22 seeded categories (of 24 DummyJSON source) collapsed into nav groups |
| `products` | `id`, `slug` unique, `title`, `description`, `category_id → categories`, `brand` (**nullable** — hide UI line when null), `price_cents` (list price), `discount_pct check (0..100)`, `stock`, `seed_rating_avg numeric(3,2)`, `seed_rating_count int`, `rating_avg`, `rating_count` (derived), `created_at` | No seller column — single-role. Seed baseline lives in `seed_rating_*`; `rating_*` maintained by trigger (Slice 8) |
| `product_images` | `id`, `product_id → products`, `url`, `position` | URLs point at `cdn.dummyjson.com` (ADR-006) |
| `addresses` | `id`, `user_id → profiles`, `full_name`, `phone`, `line1`, `line2?`, `city`, `state`, `zip`, `country`, `is_default` | Checkout writes an immutable snapshot into `orders.ship_address` |
| `cart_items` | `id`, `user_id`, `product_id`, `qty`, `added_at`, **`UNIQUE(user_id, product_id)`** | Signed-in cart only; guest cart is **client-side only** (localStorage) |
| `orders` | `id`, `user_id`, `status` (**`placed\|shipped\|delivered\|cancelled`**), `created_at`, **`ships_at`**, **`delivered_at`**, `cancelled_at?`, `subtotal_cents`, `shipping_cents`, `tax_cents`, `total_cents`, `ship_address jsonb`, `payment_id UNIQUE` | Stored status starts `placed`; `shipped`/`delivered` **derived from age** (ADR-015); `payment_id` is the idempotency key (ADR-010) |
| `order_items` | `id`, `order_id → orders`, `product_id`, `title_snapshot`, `unit_price_cents` (**effective price snapshot**), `qty` | Snapshots survive price/discount changes |
| `order_events` | `id`, `order_id`, `status` (`placed\|cancelled`), `note?`, `created_at` | Events record server actions; derived shipped/delivered come from `ships_at`/`delivered_at` |
| `reviews` | `id`, `product_id`, `user_id`, `order_id`, `rating 1–5 check`, `body`, `created_at`, **`UNIQUE(product_id, user_id)`** | Insert only via `add_review` (server, service-role); rollup trigger updates `products.rating_*` (ADR-018) |
| `payments` | `id` (= `orders.payment_id`), `user_id`, `amount_cents`, `status` (**`pending\|succeeded\|failed\|refunded`**), **`expires_at`**, `created_at` | Mock payment record; never stores card data; Slice 9 swaps the creator for Stripe |

**Derived order status** (one SQL helper, reused by API + UI):
`cancelled` if `status='cancelled'` → else `delivered` if `now() >= delivered_at` → else `shipped`
if `now() >= ships_at` → else `placed`.

**Indexes:** `products(category_id)`, `products(title/brand text search)`, `cart_items(user_id)`,
`orders(user_id, created_at desc)`, `order_items(order_id)`, `reviews(product_id)`,
`categories(nav_group_id)`.

## 2. RLS outline (per table) + function posture

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | own row | trigger only (service) | own row | — |
| `nav_groups` / `categories` / `products` / `product_images` | public | — (seed, service) | — | — |
| `addresses` | own | own (`user_id = auth.uid()`) | own | own |
| `cart_items` | own | own | own | own |
| `orders` | own | **none** (service only, via `place_order`) | service only | — |
| `order_items` | own (join via owned `order_id`) | service only | — | — |
| `order_events` | own (join) | service only | — | — |
| `reviews` | public | via **`add_review` only** | own | own |
| `payments` | own | **service only** | service only | — |

**Postgres function security (hard rule):** `place_order`, `cancel_order` and `add_review` are
`SECURITY DEFINER SET search_path = public`, and every one of them:

```sql
REVOKE EXECUTE ON FUNCTION fn(...) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION fn(...) TO service_role;
```

They are callable **only** from server code holding the service key — the client can never invoke
them directly (ADR-017). The server passes the **session-verified user id** as `p_user_id`; the
functions never read `auth.uid()` (which would be `null` under a service-role connection).
Read-only helpers (`effective_price_cents`, `order_effective_status`) are `IMMUTABLE` and may be
`PUBLIC` — they compute, they never write.

Everything not granted is denied by default. `service_role` bypasses RLS and is used **only** in
server-side routes/actions, never in client components (ADR-008).

## 3. Auth flow

- Supabase email + password via **`@supabase/ssr`**. Session reads in server components/actions use
  **`getUser()`** (server-verified — never trusts a client-passed id). **Email confirmation OFF**
  for the demo — owner disables it in the dashboard (ADR-007).
- Sign-up → `auth.signUp` (optional name field → `profiles.display_name`, else email prefix) →
  redirect to `?next=`.
- **`?next=` validation:** must start with exactly one `/`, not `//`, not `/\`, not an absolute
  URL — anything else falls back to `/` (open-redirect guard).
- `proxy.ts` guards `/checkout`, `/orders`, `/account`, `/reviews`: unauthenticated →
  `/signin?next=<path>` (auth checks live in server actions/routes where `getUser()` is available;
  the proxy only refreshes cookies and does coarse redirects — ADR-019).
- Sign-out → `auth.signOut()` → clear client cache → home.
- Guest-cart merge (if kept — optional task, Slice 5) runs as one server action on first
  authenticated cart read.

## 4. Cart persistence

- **Guest:** `localStorage` key `vendra.cart` → `{productId, qty}[]`, handled **entirely in client
  code** — no server action touches it until sign-in.
- **Signed-in:** `cart_items` under RLS.
- **Stock check lives inside the server action** (`add`/`setQty` re-verify `qty ≤ stock`) — never
  rely on the client's disabled buttons.
- **Merge (optional):** server action upserts guest lines (`qty = qty + existing`), then clears
  storage. Concurrency safe via `UNIQUE(user_id, product_id)` + upsert. **If this task is cut:**
  signed-out "Add to cart" redirects to `/signin?next=<product>` and returns the user to the PDP
  after sign-in (ADR-012 amended).
- **Subtotal:** always computed server-side — `SUM(qty * effective_price_cents(...))` — never
  trusted from the client.
- Optimistic UI: update first, reconcile with server response, rollback on error.
- Header cart badge: signed-in count from server render; guest count from client state.

## 5. Checkout transaction — `place_order`

```sql
CREATE FUNCTION place_order(p_payment_id uuid, p_address jsonb, p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
-- then: REVOKE ... FROM PUBLIC, anon, authenticated; GRANT ... TO service_role;
```

**No `p_items` parameter** — the function reads the user's `cart_items` itself. One implicit
transaction:

1. Lock and verify the `payments` row (`FOR UPDATE`): exists, `user_id = p_user_id`,
   `status = 'succeeded'`, `now() < expires_at` → else `RAISE` (no writes).
2. Read the user's cart rows; compute the expected total **server-side**: per line
   `effective_price_cents(price_cents, discount_pct)`, then shipping (free ≥ 3500¢ else 599¢) and
   tax (8% of subtotal, rounded) per spec business rules → must equal `payments.amount_cents`
   exactly → else `RAISE`.
3. **Lock products `FOR UPDATE` in a deterministic order (`ORDER BY id`)** and re-check stock for
   every line → else `RAISE 'insufficient stock'`.
4. Insert `orders` (`status='placed'`, `ships_at = created_at + 15 min`, `delivered_at = created_at
   + 2 h`, `payment_id`, address snapshot, totals) → **unique violation on `payment_id` = already
   processed → return the existing order id** (idempotency).
5. Insert `order_items` (`unit_price_cents` = effective-price snapshot), insert
   `order_events('placed')`.
6. `UPDATE products SET stock = stock - qty` for each line (already locked).
7. Delete the user's `cart_items`.
8. `COMMIT` — any failure rolls back everything.

Mock payment (Slice 6): a server route creates the `payments` row (`expires_at = now() + 15 min`)
after validating demo card details against a fixed rule set; card data is **discarded immediately —
never persisted, never logged**. The amount is recomputed from the cart server-side; the client
never supplies one. Slice 9 swaps the payment creator for a Stripe PaymentIntent re-read — steps
2–7 unchanged.

## 6. `cancel_order`

```sql
CREATE FUNCTION cancel_order(p_order_id uuid, p_user_id uuid) RETURNS void
-- SECURITY DEFINER, SET search_path = public, EXECUTE revoked except service_role (as above)
```

One transaction:

1. Lock the order `FOR UPDATE`; verify `user_id = p_user_id` → else `RAISE`.
2. If `status = 'cancelled'` → **return (idempotent no-op — no error, no writes)**.
3. Effective status must be `placed` (i.e. `now() < ships_at`) → else `RAISE 'already shipped'`.
4. Set `status = 'cancelled'`, `cancelled_at = now()`; append `order_events('cancelled')`.
5. Restore stock: `UPDATE products SET stock = stock + qty` for the order's items (`ORDER BY id`).
6. Set the order's payment to **`refunded`**.
7. `COMMIT`.

## 7. Image storage + `next/image`

- Seed stores `cdn.dummyjson.com` URLs (ADR-006). **No files downloaded initially.**
- `next.config.ts`: `images: { remotePatterns: [{ protocol: 'https', hostname: 'cdn.dummyjson.com' }],
  unoptimized: true }` — remotePatterns is still required (it validates any remote `src`);
  `unoptimized` avoids spending Vercel image-optimizer bandwidth on hotlinked CDN files
  (ADR-019).
- Supabase Storage bucket `products` is created and ready; migration is an optional later script.
- `<Image>` wrapper: aspect-ratio box + branded indigo fallback tile on `onError` (spec F1 AC).
- Cap: any future download script must stay **under 10 MB**.

## 8. Search, filters, sort

- Query built from URL params only — shareable, back/forward safe.
- Matching: `ILIKE` over `title, brand, description` (184 rows — FTS is unnecessary; YAGNI).
  **No string-built `.or()` filters:** every dynamic value goes through `escapeLike()` (escapes
  `% _ , ( ) \` and quotes) before it enters a builder filter, and filter inputs are whitelisted;
  `tests/search.test.ts` covers injection attempts (`q=men's`, `q=a,b`, `q=%`).
- Header suggestions: `GET /api/suggest?q=…` → ≤8 `{slug,title}` rows (same escaping). The
  results page `/search` is server-rendered — **no `/api/search`** endpoint (spec F2).
- Filters: `group` (nav-group **slug**), `brand`, `min`/`max` price (dollars in URL → cents in
  SQL), `rating`.
- Sort whitelist: `relevance | price_asc | price_desc | rating | newest` → unknown value → default.
- Debounced client fetch (250 ms) for suggestions only; result-grid updates are navigations.

## 9. Folder structure

```
app/
  (shop)/            # public storefront: page, c/[group], p/[slug], search, cart
  (account)/         # signin, signup, orders, orders/[id], account, checkout
  api/               # route handlers: suggest, checkout/pay, reviews
  layout.tsx         # noindex meta, header, footer (demo notice)
components/          # ui/ (shadcn), shop/ (ProductCard, FilterRail, FilterSheet, …)
lib/
  supabase/          # client.ts (browser), server.ts (server components, getUser),
                     # admin.ts (service role, import 'server-only')
  money.ts           # cents formatting/parsing — the only place money is rendered
  pricing.ts         # TS mirror of effective price for display-only paths
  search.ts          # escapeLike + filter whitelisting
  cart.ts            # guest cart storage (client-only) + optional merge
data/
  seed-products.json # committed after scripts/fetch-seed.ts runs ONCE
scripts/
  fetch-seed.ts      # one-shot: DummyJSON → data/seed-products.json (not run at build)
  seed.ts            # upsert-on-slug load (service role)
supabase/
  migrations/        # schema + RLS + place_order/cancel_order/add_review
tests/               # Vitest — integration tests point at a SEPARATE Supabase test project
proxy.ts             # Next 16 guard file (middleware.ts only if scaffolded on Next 15.x)
docs/evidence/       # screenshots + verification output (never .agent-logs/)
.env.example         # placeholders only, never read at runtime by scripts
```

## 10. Environment variables (names only — never values in docs)

| Name | Where | Used by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | anon reads |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | anon reads (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | `admin.ts`, seed scripts, RPCs (ADR-008) |
| `NEXT_PUBLIC_SITE_URL` | client + server | canonical links, redirects |
| `TEST_SUPABASE_URL` / `TEST_SUPABASE_ANON_KEY` / `TEST_SUPABASE_SERVICE_ROLE_KEY` | test runner only | integration tests against a **separate** Supabase test project |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Slice 9 (future) | Stripe test mode |

`.env.example` lists these names with empty/placeholder values. Values live only in the local env
file (git-ignored) and the Vercel dashboard — never in docs, logs, or client bundles.

## 11. Free-tier limits (ASSUMPTION — verify on dashboards, 2026-10)

- **Supabase Free:** ~500 MB database, 1 GB storage, ~50k monthly active users; free projects
  **auto-pause after ~7 days of inactivity** (ADR-009 — unpause + re-seed before demo day).
  Two free projects are enough: one demo, one **test** project for Vitest integration tests.
- **Vercel Hobby:** generous but metered bandwidth/function-duration; `unoptimized` images avoid
  spending optimizer bandwidth on hotlinked CDN photos.
- **DummyJSON:** no rate-limit guarantee; images hotlinked with a fallback tile (ADR-006).
- Hard caps: seed JSON < 10 MB on disk; no download script > 10 MB; the 194-product source is one API page.

## 12. Seed-data source

- **DummyJSON** — verified 2026-10-03: source has 194 products / 24 categories (seed excludes
  `vehicle` + `motorcycle` → **184 products / 22 categories / 6 nav groups** — ADR-021 +
  furniture merge), 1–4 photos + thumbnail each,
  MIT `LICENSE` file. Fetched **once** into committed `data/seed-products.json` (~1–2 MB).
- Runtime dependency: product images only (CDN) — graceful fallback if it dies (ADR-006).
- Category collapse: 22 seeded categories (of 24 source) → **6 nav groups**, each with a
  **slug** (`nav_groups` table) — mapping fixed in Slice 1, merged in Slice 2 follow-up.
- **Seeding is upsert-on-slug with stable ids** (`onConflict: 'slug'`), so re-runs never change
  ids that other tables (reviews, orders in tests) reference.
- **Rating baseline:** `seed_rating_avg` / `seed_rating_count` store DummyJSON's own
  numbers as display baseline; `rating_avg` is initialized from `seed_rating_avg`, while
  `rating_count` starts at **0** — real reviews only (ADR-022: the seed "count" is
  `reviews.length`, not a real count) — and the review trigger (Slice 8) maintains
  `count = |reviews|`, `avg = Σratings / count`.
- **Seed reviews skipped** — DummyJSON review text contains reviewer emails we must not store
  (ADR-018).
- No duplicated products, no synthetic variants (spec/owner rule).
