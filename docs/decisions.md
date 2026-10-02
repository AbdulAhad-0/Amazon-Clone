# Vendra — Decision Log (ADR-style)

Short entries: context → decision → consequences. Revisit by adding a new ADR, never editing history
(except typo fixes).

### ADR-001 · Brand = VENDRA — Accepted
Context: own brand required; pixel-copy of Amazon scores poorly. Decision: **Vendra** (from *vendor*),
proposed alongside Kartly and Nordkart. Consequence: all copy, logo, domains and video say Vendra only.

### ADR-002 · Zero Amazon branding — Accepted
Context: brief hard rule; phishing-flag risk. Decision: no Amazon name/logo/orange/smile/copy in code
or UI; `noindex` meta on every page; `robots.txt` disallow all; footer demo notice. Consequence: no
search-engine indexing, no borrowed marketing text.

### ADR-003 · Fixed stack, no server process — Accepted
Context: brief fixes the stack. Decision: Next.js App Router + TS strict, Supabase, Tailwind + shadcn,
Vercel; business logic in Server Actions / route handlers / Postgres functions. Consequence: no
Express, no separate API deploy.

### ADR-004 · Money = integer cents, server-computed — Accepted
Context: floats lose money; client totals can lie. Decision: all amounts `INTEGER` cents; every total,
subtotal and tax computed on the server; client renders formatted output only (`lib/money.ts`).
Consequence: price inputs are dollars-in-URL → cents-in-SQL at the boundary.

### ADR-005 · Seed = DummyJSON, 194 products, committed JSON, 8–10 nav groups — Accepted
Context: brief said 500–2000; owner prefers quality over quantity. Verified 2026-10-03: DummyJSON has
**194 products, 24 categories, 1–4 photos each, MIT licence**; FakeStoreAPI only 20/4. Decision: fetch
DummyJSON **once** via `scripts/fetch-seed.ts` into committed `data/seed-products.json`; collapse the
24 categories into **8–10 nav groups**; no duplicated products. Consequence: brief's 500–2000 count
deliberately **not** met — owner-approved trade-off (quality, real photos).

### ADR-006 · Images hotlink CDN now, Storage later — Accepted
Context: owner's 10 MB download cap; 500–800 image files would exceed it; photo licence unclear
separate from MIT. Decision: store `cdn.dummyjson.com` URLs; branded fallback tile on load error;
optional later script may migrate a subset into Supabase Storage if the CDN proves flaky.
Consequence: runtime dependency on their CDN — mitigated by the fallback, logged as OPEN QUESTION.

### ADR-007 · Supabase email confirmation OFF for the demo — Accepted
Context: recon shows four verification interstitials before an account exists; 24-hour demo needs a
frictionless sign-up. Decision: disable "Confirm email" in the Supabase Auth dashboard.
**Manual step the owner must perform in the dashboard** (cannot be done from code/repo).
Consequence: anyone can sign up with any email — acceptable for a noindex demo.

### ADR-008 · `service_role` key is server-only — Accepted
Context: leaked service key bypasses all RLS. Decision: key lives in a server-only env var, **never
`NEXT_PUBLIC_*`**, never imported by client components, never logged; `.env.example` carries a
placeholder only. Consequence: client code talks to Supabase with the anon key + RLS alone.

### ADR-009 · Supabase free tier can pause — Accepted
Context: free projects pause after inactivity. Decision: note it in runbook — unpause and re-run
`npm run seed` if data vanished, before demo day. Consequence: possible cold-start delay; no code cost.

### ADR-010 · Mock payment is server-side, verified, idempotent, in-transaction — Accepted
Context: brief: order only after server verifies payment; creation + stock + cart cleanup in ONE
transaction. Decision: Slice 6 uses a **server-side mock** — a `payments` row created by a route
handler (fixed demo rules, server-computed amount); `place_order(p_payment_id, …)` re-verifies
`status='succeeded'` and amount, and `orders.payment_id UNIQUE` makes repeat submits return the same
order. Consequence: client can never create an order or set a price; Slice 9 swaps only the payment
creator (Stripe PaymentIntent re-read), transaction unchanged.
**Amended (pre-approval pass):** payments carry `expires_at` (15 min) and `place_order` rejects
expired ones; card data is validated then discarded — **never persisted, never logged**; the
function derives line prices/shipping/tax itself from spec business rules.

### ADR-011 · Search = SQL `ILIKE`, no external engine — Accepted
Context: 194 rows; FTS/Elastic is YAGNI. Decision: `ILIKE` over title/brand/description + whitelisted
sorts; filters expressed as URL params. Consequence: trivial to keep URL-state the single source of truth.

### ADR-012 · Guest cart in localStorage, merge on sign-in — Accepted
Context: recon shows checkout forces sign-in; a dead guest cart is bad UX. Decision: guest cart in
`localStorage`, DB cart under RLS when signed in, one merge action on first sign-in.
Consequence: merge must be idempotent (`UNIQUE(user_id, product_id)` + upsert).
**Amended:** guest cart runs in **client code only** until sign-in; merge is a separate **optional**
task — if cut, signed-out "Add to cart" redirects to `/signin?next=<product>` and returns after
sign-in (plans mark this cut path explicitly).

### ADR-013 · Tests = Vitest; never claim unrun results — Accepted
Context: brief forbids claiming anything passed without running it. Decision: Vitest for `lib/money`,
seed mapping and `place_order` behaviour (integration against a local/remote DB when available);
every status claim in `progress.md` must cite a command actually executed.

### ADR-014 · Light-first, dark-ready tokens — Accepted
Context: dark theme is NICE-TO-HAVE; palette fixed by owner. Decision: all colours as CSS variables
(`--accent #3B3FA8`, `--paper #FAF8F4`, ink neutrals; **no orange, no teal**), so a dark theme is a
token-file swap later. Consequence: components must not hardcode hex values.

### ADR-015 · Order statuses derived from age — Accepted
Context: a demo cannot wait 24 h to ship an order; storing a fake `shipped` flag invites client
tampering. Decision: statuses are `placed | shipped | delivered | cancelled`. The server sets
`ships_at = created_at + 24 h` and `delivered_at = created_at + 72 h` at order creation;
`shipped`/`delivered` are **derived** from those timestamps by one SQL helper reused by API and UI.
Only `cancelled` is ever written after `placed`. Consequence: timeline UI reads events for
placed/cancelled and timestamps for shipped/delivered; thresholds live in the spec business-rules
table (edit there, not here).

### ADR-016 · Pricing rules live in one spec table + one function — Accepted
Context: `price_cents` alone can't express discounts, shipping or tax; client math is forbidden.
Decision: `price_cents` is the **list price**; a single SQL `effective_price_cents(price_cents,
discount_pct)` computes the discounted price (floor to whole cent) and every consumer — PDP, cart,
checkout, `order_items.unit_price_cents` snapshot — uses it. Shipping: free ≥ 3500¢, else 599¢
flat. Tax: flat 8% of subtotal, rounded. All three values are **ASSUMPTION** and editable in the
spec business-rules table only. Consequence: changing a rate is a spec edit + one migration at
most; no scattered constants.

### ADR-017 · `place_order` is service-role-only and reads the cart itself — Accepted
Context: `SECURITY DEFINER` functions are dangerous if anon can `EXECUTE`; client-supplied line
items invite tampering. Decision: `place_order(p_payment_id, p_address, p_user_id)` —
`REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` + `GRANT ... TO service_role`,
`SET search_path = public`. No `p_items`: the function reads the caller's `cart_items`, computes
totals itself and compares with `payments.amount_cents`; products are locked `FOR UPDATE ORDER BY
id` (deterministic order, no deadlocks). The user id comes from the server-verified session as a
parameter — never `auth.uid()` (null under service-role connections). Same posture for
`cancel_order` and `add_review`. Consequence: the client's entire checkout surface is one
`POST /api/checkout/pay` that can only create (never confirm) a payment.

### ADR-018 · Reviews: server-derived order, trigger rollup, no seed reviews — Accepted
Context: DummyJSON review text contains reviewer emails we must not store; rating display must not
drift from real reviews. Decision: the client posts `{productId, rating, body}` only — the server
derives the eligible order (latest **non-cancelled** order containing the product); a DB trigger
combines the seed baseline (`products.seed_rating_avg/seed_rating_count`) with real reviews into
`rating_avg/rating_count`; seed **review rows are skipped** (baseline numbers only). Consequence:
verified-purchase is structural (no `orderId` from the client); re-running the seed can never
break review counts (upsert-on-slug keeps ids stable).

### ADR-019 · Current-Next conventions: `proxy.ts`, async params, `next/image` config — Accepted
Context: Next 16 deprecated `middleware.ts` (renamed `proxy.ts`, Node runtime) and `images.domains`
(`remotePatterns`); App Router params are async promises. Decision: scaffold on current stable
Next (16.x) and use `proxy.ts` + `export default function proxy()` — Slice 0 checks
`next --version` first and falls back to `middleware.ts` only if the scaffold is 15.x. All dynamic
routes `await params`. `next.config.ts` sets `images.remotePatterns` for `cdn.dummyjson.com` plus
`unoptimized: true` (hotlinked CDN images must not spend Vercel optimizer bandwidth — remotePatterns
still validates remote `src`). Auth/session reads use `@supabase/ssr` with **`getUser()`**.
Consequence: guards stay thin; real auth checks live in server actions/routes.

### ADR-020 · Windows-safe verification, evidence in `docs/evidence/`, separate test DB — Accepted
Context: the build machine is Windows (PowerShell) — `grep`/`curl`/`sleep` are unreliable; the
brief bans claiming unrun results; tests must never touch demo data. Decision: plans verify with
PowerShell (`Select-String`, `Invoke-WebRequest`) or small Node scripts; screenshots and command
output go to **`docs/evidence/`** (never `.agent-logs/`); Vitest integration tests run against a
**separate Supabase test project** (`TEST_SUPABASE_*` env names only). Consequence: evidence is
repo-visible and reviewable; a failed test can't wipe the demo catalogue.
