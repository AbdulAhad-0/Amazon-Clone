# Vendra

A demo storefront: browse 183 seeded products, search and filter, keep a cart (guest or signed-in), check out with a mock card, track and cancel orders, and leave a buyer-only review.

Built for the 8x assignment: rebuild a live product in 24 hours, make it your own.

- Live: <LIVE_URL>
- Walkthrough: <WALKTHROUGH_URL>
- Author: <GITHUB_HANDLE>

**Demo notice:** not a real store. Payments are mocked. Nothing ships. Every page is `noindex`.

## Try it in 60 seconds

1. Browse with no account: home, category pages, search, and product pages are public.
2. Click **Add to cart** on any in-stock product. A guest cart works in your browser. Sign up with an email and password (one screen, no confirmation email in this demo). The guest cart merges into your account.
3. Go to checkout. Fill the address. For the card, use:
   - `4242 4242 4242 4242` — succeeds.
   - `4000 0000 0000 0002` — fails (declined, demo rule).
   - Any expiry (for example `12/30`) and any CVC (for example `123`).

No real card data is stored or logged. Card fields are validated on the server, then discarded. Only the outcome (`succeeded` or `failed`) and the server-computed amount are saved. A payment expires after 15 minutes.

## Theme: "No surprises"

The shopper never learns about a cost after committing. The cart and checkout show the item price, shipping, estimated tax, and the total **before** the pay button, all computed on the server. Shipping is free when the subtotal is $35.00 or more; otherwise it is a flat $5.99. Tax is a flat 8% estimate of the subtotal, rounded to the nearest cent. Prices use one currency (USD) and integer cents everywhere, so the number you see is the number you pay.

## What the reference does / what I did / why

Only pain points the spec marks CONFIRMED (recon screenshot cited in `docs/spec.md` §7). One row is labelled as an assumption, because the spec does.

| Area | Reference (Amazon) | Vendra | Why |
|---|---|---|---|
| Sign-up | Four verification steps before an account exists (puzzle → email OTP → phone → WhatsApp) | One screen: email + password | The recon screenshots show pure friction before a buyer can buy |
| Header | Top bar hides on scroll down, returns on scroll up | Sticky header on every page; search, account and cart never leave | The shopper keeps their place without fighting the page |
| Filters on phones | Desktop-only rail was captured (spec labels phone filters an **assumption**) | Bottom sheet on phones that writes byte-identical URLs to the desktop rail | The same filters must work on every screen |
| Cart | Cross-sell carousels above and below the fold | Lines, subtotal, one primary button | A calm cart gets a shopper to checkout |
| Checkout | Modal address form plus a floating security tooltip | Single page: address, summary, pay button, trust copy inline | Anxiety comes from hidden or floating UI |
| Orders | "0 orders placed" with no guidance | Status timeline plus a cancel action that restores stock | A buyer needs to see what happens next |
| Prices | PKR on cart lines and USD on the same page | One currency (USD), integer cents, computed on the server | Mixed currencies make every total suspect |

Reported by others, not tested by me: shipping to certain countries, import fees, card declines (spec §7.1, REPORTED). Not addressed — cross-border logistics are outside a demo storefront.

## What is built

Verified means `docs/progress.md` cites the command output.

- **Seed catalogue** — 183 products, 22 categories, 6 nav groups, 422 images (`npm run verify-seed` → `verify-seed: OK`).
- **Browse and category pages** — home, `/c/[group]` grids with breadcrumb, count, pagination, loading skeleton, empty state (build exit=0; 29/29 browser checks in Slice 2).
- **Search and filters** — URL-driven state, desktop rail, mobile bottom sheet, debounced header suggestions (30/30 tests; 28/28 browser checks in Slice 3).
- **Product page** — gallery, buy box, qty stepper with server-side total, related row, branded fallback tile when a photo fails (Slice 2, 29/29).
- **Auth** — sign up / in / out, `?next=` return with open-redirect guard, protected routes (40/40 tests; 47/47 browser checks in Slice 4).
- **Cart** — signed-in cart in Postgres under RLS, guest cart in localStorage, idempotent merge on sign-in, optimistic qty with server reconciliation (76/76 tests at Slice 5; 66/66 browser checks).
- **Checkout with mock payment** — address, demo card rules, one `place_order` transaction for payment check, order, stock decrement and cart cleanup (22/22 DB tests in `tests/orders_money.test.ts`; `scripts/verify-6-7-8.ts` → `RESULT: OK`).
- **Orders and cancel** — list with status tabs, detail page, timeline derived from order age, cancel while `placed` restores stock and is idempotent (same 22/22 suite).
- **Buyer-only reviews** — server derives the eligible order; non-buyer POST → 403, duplicate → 409 (same 22/22 suite).
- **Home page and carousel** — three data-driven slides (arrows, dots, pause, reduced-motion respected), category tiles, budget chips, quick-links row (Slice 10: typecheck 0, build 0, live probe PASS).
- **Deals and Best Sellers** — `/deals` (discount > 0, in stock, 24 per page) and `/best-sellers` (ranked by units sold). **Best sellers fallback:** until 10 total units have sold, the page shows top-rated products with a visible note saying so. The live probe confirmed the fallback note is showing.

## What I cut and why

All marked not built.

- **Stripe (Slice 9)** — deferred until slices 1–8 passed, then outside the 24-hour budget. The mock payment creator is the only piece a Stripe integration would replace.
- **Wishlist** — not built. Never in the 24-hour scope.
- **Selling, business accounts, gift cards, registry** — not built. Outside a buyer journey (spec §6).
- **CAPTCHA, email OTP, phone OTP, WhatsApp verification** — not built. Four interstitials of pure friction for a demo (spec §6).
- **Language, currency and country switchers** — not built. One locale, one currency (spec §6).
- **Prime-style subscriptions, ads, sponsored carousels, 20+ home carousels, browsing-history walls** — not built. They slow the page and add no product value (spec §6).
- **New Releases** — not built. All seed products share one `created_at`, so a "newest" ranking would be fake (ADR-023).
- **Order emails** — not built. The demo sends no email of any kind.
- **Dark theme, customer service pages** — not built. Nice-to-have on the roadmap, never reached.

## Engineering decisions

- **Next.js App Router + TypeScript (strict), Tailwind, Supabase, Vercel.** No separate API server; business logic lives in server actions, route handlers and Postgres functions (ADR-003).
- **Money is integer cents, computed on the server.** The client only formats what the server returns (ADR-004).
- **`place_order` and `cancel_order` are Postgres functions callable only by the service role.** `EXECUTE` is revoked from `PUBLIC`, `anon` and `authenticated`; the server passes the session-verified user id in (ADR-017).
- **Checkout is idempotent and atomic.** `place_order` keys on `orders.payment_id UNIQUE` (repeat submits return the same order) and does payment check, order insert, stock decrement and cart cleanup in one transaction (ADR-010, spec §4 F5).
- **RLS on every table.** Products and images are public read; carts, orders, addresses, payments and profiles are own-row; orders and payments are written only by the service role; reviews are public read with insert only through `add_review` (architecture §2).
- **The guest cart stores only product ids and quantities** in localStorage — no prices, no user data — and merges once on sign-in via an idempotent upsert (ADR-012).
- **Order status is derived from order age** because there is no fulfilment system: `ships_at = created_at + 15 minutes`, `delivered_at = created_at + 2 hours`. Only `cancelled` is ever written after `placed` (ADR-015).

## Trade-offs and honest limitations

- **Payments are mock.** A fixed demo rule set decides success or decline. No payment provider is involved.
- **Product data comes from DummyJSON** (MIT). Photos are hotlinked from its CDN; the photo licence is separate from MIT and not stated (ADR-006, spec §8).
- **Seed ratings are not real counts.** `seed_rating_count` is just the length of the source review array (exactly 3 for every product), so the UI never shows it. The average shown before any real review is real source data (ADR-021, ADR-022).
- **Seed exclusions:** the vehicle and motorcycle categories (10 products) and one product named after the reference retailer were dropped. Final seed: 183 products, 22 categories, 6 nav groups (ADR-021).
- **Email confirmation is off** for the demo — a dashboard setting, done by hand (ADR-007).
- **Free tiers.** Supabase and Vercel free tiers are used. A free Supabase project can pause after inactivity; unpause it and re-run `npm run seed` if data vanished (ADR-009).
- **Test gaps, as listed in `docs/progress.md`:** the browser checks for checkout/orders/reviews (Phase I in `e2e/matrix.py`) were written but never executed — the final matrix run crashed on an older bug; money and security paths are covered by the 22/22 DB suite instead. Integration tests against a separate test database were skipped (the owner never confirmed a second Supabase project, ADR-020). Screenshots for home/category/checkout/orders/reviews from the final runs are missing from `docs/evidence/`.
- **Known open bugs:** `/c/electronics?page=2` (and higher) intermittently hangs — a pre-existing category-pagination bug that crashed the last full e2e run and still needs diagnosis; `/c/nope` and `/p/nope` render a branded not-found page but return HTTP 200 instead of 404. Slice 10 leftovers: rail de-duplication, category-tile sizing and rail arrow buttons.
- **Cut for time:** the full final e2e run, the missing screenshots, and Stripe.

## How to run locally

Commands are exactly the ones in `package.json`.

```bash
npm install
npm run dev        # dev server
npm run build      # production build
npm run start      # serve the build
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run e2e        # Playwright matrix (python e2e/matrix.py)
npm run seed       # load the seed catalogue
npm run verify-seed
npm run dbcheck
```

Env var names (values live only in `.env.local`, which is git-ignored):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL
TEST_SUPABASE_URL
TEST_SUPABASE_ANON_KEY
TEST_SUPABASE_SERVICE_ROLE_KEY
```

**Migrations:** the SQL files in `supabase/migrations/` (`0001_…` through `0010_…`) are applied in order in the Supabase SQL Editor. They are not run by any npm command.

**Live database needed:** `npm test` (RLS and order suites hit a real database), `npm run seed`, `npm run verify-seed`, `npm run dbcheck`, and `npm run e2e` (needs the build, a running server and Playwright). `npm run typecheck` and `npm run build` run without a database.

## How AI was used

- **Tool:** OpenCode v1.18.34. **Model:** MiMo-V2.6-Flash (`opencode/mimo-v2.6-flash-free`) — one model for planning and building, no mid-session switch.
- **Docs first, code second.** The spec, architecture, roadmap and per-slice plans were written and approved before any code (`docs/spec.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/plans/`). Work then ran one slice at a time, in order, with `docs/progress.md` updated per slice.
- **Capture plugin.** `.opencode/plugins/capture.js` writes every prompt and final response to `.agent-logs/`. See `CAPTURE-TEST.md` — it had two bugs at first (an empty response written 96 ms after the prompt, and only the last assistant message of a turn being kept), both fixed before the canary tests passed. Child sessions are not captured.
- **Screenshots and command output** live in `docs/evidence/`.

**What went wrong.** A stale `next start` server kept serving a deleted `.next` build, which returned CSS 500s and dead handlers — it cost a clean rebuild and a rules change (kill node/next before every build, one server at a time). Orphan `next dev` child processes on port 3000 had to be killed by hand before browser checks. Sign-out showed a stale header: `revalidatePath` alone could not clear the client router cache, so the fix was `router.refresh()` + `router.replace("/")` (Slice 4, D8). The repo sits inside a OneDrive-synced folder, which adds file-sync noise around builds. The last full e2e run crashed on the category-pagination hang described above, before its checkout/orders/reviews phase could run.

## Data credits

- Product data: [DummyJSON](https://dummyjson.com), MIT licence.
- Photos: hotlinked from the DummyJSON CDN. Photo licence is not stated separately (see Trade-offs).

## Walkthrough plan (5 minutes, camera on)

- **0:00–0:45** — Home: carousel, trust strip, category tiles, budget chips. State the theme: no surprises.
- **0:45–1:30** — Search and filter: type in the header, apply brand + price on desktop, show the same filter sheet on a phone-width window, Back restores the URL.
- **1:30–2:15** — Product page: gallery, qty stepper recomputing the total server-side, add to cart as a guest, sign up (one screen), cart merges.
- **2:15–3:15** — Checkout with `4242 4242 4242 4242`: show totals before pay, place the order, then try `4000 0000 0000 0002` and show the declined message with the cart intact.
- **3:15–4:00** — Orders: timeline, cancel the order, show stock restored; show `/best-sellers` fallback note.
- **4:00–4:30** — Reviews: buy, review, show the verified badge; show the non-buyer 403.
- **4:30–5:00** — Honest limits: mock payment, hotlinked photos, open bug on category page 2, what was cut and why.
