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
*(Seed counts superseded by ADR-021: seed = 184 products / 22 categories / 7 nav groups.)*

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
Context: a demo cannot wait for real shipping; storing a fake `shipped` flag invites client
tampering. Decision: statuses are `placed | shipped | delivered | cancelled`. The server sets
`ships_at = created_at + 15 minutes` and `delivered_at = created_at + 2 hours` at order creation
(demo-time lifecycle, owner sync 2026-10-03);
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

### ADR-021 · Exclude vehicle + motorcycle; seed = 184 products / 22 categories / 7 nav groups — Accepted
Context: owner decision, Slice 1 follow-up (2026-10-03): drop the `vehicle` and `motorcycle`
categories from the seed (out of scope for the demo storefront). Live re-verification same day
(not memory): DummyJSON has 24 categories summing to exactly 194 products; `vehicle=5`,
`motorcycle=5` → 10 products removed. Decision: seed = **184 products / 22 categories / 7 nav
groups** — `toys` dropped (never had a source category) and `pets-automotive` dropped (it held
only the two excluded categories), so **every nav group has ≥1 product** and Home can only ever
render groups with products. `scripts/fetch-seed.ts` pins source `194/24` **and** seed `184/22`,
asserts the exclusion list against live data; `scripts/seed.ts` upserts, then **deletes** rows
absent from the seed (products → categories → nav_groups, FK order; safe — no orders exist yet);
`scripts/verify-seed.ts` expects `184/22/7`. **Supersedes the 194-products seed figure in
ADR-005** (ADR-005's source/delivery choices stand). **`seed_rating_count` is NOT a real rating
count from the source**: it is the length of DummyJSON's `reviews` array — exactly **3 for every
product** (verified live: distribution `{"3":194}`); only `rating` (`seed_rating_avg`) comes from
the source, and DummyJSON computes it over those same 3 shown reviews. No review bodies,
reviewer names or reviewer emails are stored (array length only); `data/seed-products.json`
scanned: 0 email matches, 0 reviewer/reviews keys. Consequence: any doc still saying "194"
refers to the source total, not the seed; ratings roll up from this baseline + real reviews
(Slice 8 trigger). *Follow-up same day: the 5-product `furniture` group was merged into
`home-kitchen` (category re-parented, group row dropped — no product ids touched) → **6 nav
groups**, every one with ≥1 product.*
*Follow-up 2026-10-03 (seed cleanup): the one Amazon-named product (`amazon-echo-plus`, "Amazon
Echo Plus") was dropped — our own branding must never ship a product called Amazon, and a
third-party product named after it still looks like a copy. New seed = **183 products / 22
categories / 6 nav groups / 422 images**; `fetch-seed.ts` now excludes `/amazon/i` in
title+brand+description and pins 183, `verify-seed.ts` expects 183 — both verified
(`npm run verify-seed` → `verify-seed: OK`).*

### ADR-022 · Rating display = average stars only until real reviews exist — Accepted
Context: `seed_rating_count` is not a real count — it is the length of DummyJSON's `reviews`
array, exactly 3 for every product (ADR-021); rendering "3 ratings" would be fabricated social
proof. Decision: the UI shows the **average** (stars + value from `rating_avg`) and **no count**
while `rating_count = 0`. A count renders only once real user reviews exist (Slice 8 trigger
rollup, ADR-018), and then it shows **only the real number** of those reviews — never the seed's
3. Data consequence (supersedes the slice-1 plan's "initialize `rating_*` = seed values"):
`rating_avg` starts at `seed_rating_avg` (the average is real source data), `rating_count`
starts at **0**; `npm run seed` resets untouched baselines and `verify-seed` asserts
`rating_count_zero=184`. Consequence: count-gated UI ("Popular right now", any
"N reviews" label) reads the live columns and simply stays hidden until Slice 8 fills them.

- **ADR-023 (Slice 10): No "New Releases" page** � every seed product shares one created_at, so a "newest" ranking would be fake; /best-sellers ranks real units sold instead (with a top-rated fallback below MIN_SALES_FOR_RANKING = 10 units).
