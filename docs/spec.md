# Vendra — Product Spec

**Status:** DRAFT — awaiting owner approval (design direction approved with changes, 2026-10-03;
this spec becomes APPROVED only when the owner signs off)
**Spec location:** `docs/spec.md` (user-specified; supersedes the skill default)

---

## 1. Brand

Three names were proposed; **VENDRA** is chosen.

| Name | Rationale |
|---|---|
| **Vendra** ✅ chosen | From *vendor*. Short, ownable, easy to mark with a chevron "V". No marketplace-clone echo. |
| Kartly | Cart + friendly suffix. Obvious e-commerce, playful, slightly generic. |
| Nordkart | Nordic + cart. Signals the clean, quiet design direction; heavier to say. |

**Branding rules (hard):** never the word Amazon, its smile/orange, or its copy — in code, UI, copy,
docs, commit messages or demo video. Wordmark: `vendra` set in the display face, accent underline.

## 2. Design direction

**Palette tokens (CSS variables, light-first, dark-ready):**

| Token | Value | Use |
|---|---|---|
| `--accent` | `#3B3FA8` (deep indigo) | CTAs, links, focus rings, deal badges, logo mark |
| `--accent-hover` | `#32358F` | Hover/pressed states |
| `--paper` | `#FAF8F4` (warm off-white) | Page background |
| `--surface` | `#FFFFFF` | Cards, sheets |
| `--ink` | `#17181D` | Primary text |
| `--ink-muted` | `#5C5F6B` | Secondary text |
| `--line` | `#E4E1DA` | Borders/dividers |
| `--danger` | `#B3261E` | Errors, destructive actions only |

**Forbidden:** orange, teal, smile motifs.

**Typography:** serif display (via `next/font`, e.g. Fraunces) for hero/category headings; neutral sans
(e.g. Inter) for UI. **Layout:** mobile-first; desktop adds a left filter rail. **Motion:** CSS-only,
subtle, respects `prefers-reduced-motion`. **States:** every data surface ships loading skeleton,
empty state and error state.

## 3. Roles

- **Buyer** — the only role. No seller, admin or business accounts (cut, see §6).
- **System** — Supabase `service_role`, server-only, performs money/stock transactions.

## 4. Core flows and acceptance criteria

### F1 Browse (home, category, PDP)
- Home renders hero + the **collapsed nav groups** (6 groups after ADR-021 exclusions + the
  furniture merge into home-kitchen — not 24 raw categories; every group has ≥1 product) + curated rows.
- Category page: paginated product grid, breadcrumb, count, loading skeleton, empty state.
- PDP: image gallery (uses every image the seed provides), title, brand (**nullable** — brand line
  hidden when null), price (effective price → display),
  stock, qty + **Add to cart**, delivery estimate copy, rating summary, reviews list, related row.
- **AC:** every route returns 200 with `noindex`; no layout shift >0 on image load (aspect boxes);
  broken image → branded fallback tile (never a broken-image icon).

### F2 Search / filters / sort
- `GET /search?q=…&group=…&brand=…&min=…&max=…&rating=…&sort=…` — all state in the URL.
- Sorts: relevance · price asc · price desc · rating · newest.
- Header search shows debounced suggestions from **`GET /api/suggest?q=…`** (≤8 titles, all values
  `escapeLike`-escaped). The results page is server-rendered — there is deliberately **no
  `/api/search` JSON endpoint** (YAGNI).
- Desktop: left rail. Mobile: **bottom sheet**, same params, same URL encoding.
- **AC:** back/forward restores query, filters and scroll position; result count shown; empty state
  offers a clear-filters action; typing does not fire a request per keystroke (debounced).

### F3 Auth (sign up / in / out)
- One screen each. Email + password. **Email confirmation is OFF for the demo** (ADR-007) —
  the owner must disable it in the Supabase dashboard.
- **AC:** sign-up creates a `profiles` row via trigger; sign-out clears client state; protected
  routes (`/checkout`, `/orders`, `/account`, review form) redirect to sign-in with `?next=` return.

### F4 Cart (persistent, optimistic)
- Signed-in: `cart_items` in Postgres under RLS. Guest cart is an **optional slice-5 task** (client-side
  localStorage + merge on sign-in); **if cut**, signed-out "Add to cart" redirects to sign-in and
  returns to the product page afterwards.
- Qty change/optimistic UI updates immediately, reconciles with server, rolls back on failure;
  **the stock check always runs inside the server action.**
- Subtotal is **computed on the server** from the effective price (business-rules table).
- **AC:** cart survives reload and device change (signed-in); decrementing to 0 removes the line;
  concurrent tabs converge without duplicate rows (`unique(user_id, product_id)`).

### F5 Checkout (fake payment, one transaction)
- Address form → order summary → **server-side mock payment** (a fake PaymentIntent-style record).
- Card fields are **validated then discarded — never stored, never logged**; only the outcome
  (`payments.status` + server-computed amount) is persisted. Payments expire after **15 minutes**
  (`payments.expires_at`).
- One Postgres transaction (`place_order`, ADR-010/017): verify payment (user from the
  server-verified session via `p_user_id`, amount vs. server-computed total, not expired) → insert
  order + items (effective prices snapshotted) → decrement stock → clear cart. The function
  **reads the user's `cart_items` itself** — the client sends no line items and no amounts.
  Order exists **only** if payment verifies.
- Totals follow the business-rules table below (effective price, shipping, tax).
- **AC (idempotent):** submitting twice with the same `payment_id` yields **one** order;
  insufficient stock or an expired payment aborts the transaction with a friendly error and
  **no** partial writes (automated tests).

### F6 Orders
- List (status filter), detail page, status timeline. Statuses: `placed | shipped | delivered |
  cancelled`. `shipped` and `delivered` are **derived from order age** (`ships_at = created_at +
  15 minutes`, `delivered_at = created_at + 2 hours` — business-rules table, ADR-015; demo-time
  lifecycle); the stored status starts at `placed` and can only become `cancelled` (server-set).
- **Cancel** allowed while the effective status is `placed` (before `ships_at`): one
  `cancel_order` transaction sets `cancelled` + `cancelled_at`, appends an event, restores stock
  and sets the payment to **`refunded`**. Calling cancel twice is an **idempotent no-op** — no
  double restock, no error.
- **AC:** a user sees only their own orders (RLS, test); cancelling twice does not double-restock
  (test); the timeline draws placed/cancelled from `order_events` and shipped/delivered from
  `ships_at`/`delivered_at`.

### F7 Reviews (buyer-only)
- Client posts only `{ productId, rating, body }` — the **server derives the eligible order**
  (that user's most recent **non-cancelled** order containing the product). **No `orderId` from
  the client.**
- **One review per product per user** (DB unique). Server re-checks everything — client checks
  are cosmetic.
- Rating rollup runs in a DB **trigger** combining the seed baseline (`products.seed_rating_avg`
  / `seed_rating_count`, stored by Slice 1) with real reviews into `rating_avg` / `rating_count`.
- **Seed reviews are skipped** — DummyJSON review text carries reviewer emails we must not store;
  only the baseline rating numbers are seeded (ADR-018).
- **AC:** non-buyer POST → 403; second review → 409; buyer of only-cancelled orders → 403;
  rollup updates after insert (tests).

### Business rules (prices · shipping · tax · age) — all values ASSUMPTION

| Rule | Value | Notes |
|---|---|---|
| **Effective price** | `floor(price_cents × (100 − discount_pct) / 100)` | `price_cents` is the **list price**. **One server function** `effective_price_cents(price_cents, discount_pct)` computes the discounted price; PDP, cart, checkout and `order_items.unit_price_cents` all use/snapshot it. |
| **Shipping** | Free when subtotal ≥ **$35.00** (3500¢); else flat **$5.99** (599¢) | Server-computed; threshold shown in cart/checkout. |
| **Tax** | Flat estimated **8%** of subtotal, rounded to the nearest cent | Demo estimate — not a real tax engine. |
| **Order age → status** | `ships_at = created_at + 15 minutes`, `delivered_at = created_at + 2 hours` | Drives derived `shipped` / `delivered` (ADR-015); full lifecycle visible within a demo. Cancel exists only while effective status is `placed` (before `ships_at`). |
| **Payment expiry** | Mock payment valid **15 minutes** (`payments.expires_at`) | Expired → `place_order` raises, no writes. Card data never stored/logged (ADR-010). |

*Edit values here — architecture and every plan read from this table.*

## 5. Kept from the original

*Each entry is an **ASSUMPTION** derived from the recon screenshots — correct any after reading.*

- **ASSUMPTION** Search-first header with live suggestions is the core of the shopping loop → kept.
- **ASSUMPTION** Category browse → PDP with gallery and a clear buy box converts → kept, redesigned.
- **ASSUMPTION** Persistent cart with visible qty steppers and line actions → kept.
- **ASSUMPTION** Orders page with status tabs is the right mental model → kept, with a real timeline.
- **ASSUMPTION** Left filter rail on desktop with counts → kept (mobile gets a bottom sheet).
- **ASSUMPTION** Reviews with rating histogram + average → kept (verified-purchase badge only).
- **ASSUMPTION** Multi-level footer with help links → kept, shortened to one row of our own links.

## 6. Cut and why

- **CAPTCHA puzzle, email OTP, phone OTP, WhatsApp verification** — four interstitials to sign up
  (5-*.png); pure friction for a demo, no real security value. Email/password only.
- **Language, currency and country switchers** — single locale and currency for the demo.
- **Prime / subscriptions / ads / sponsored carousels** — ad slots were ~40% of the captured PDP and
  list pages; they slow the page and add zero product value.
- **Seller side, business accounts, gift cards, registry, "sell on …" footer columns** — outside a
  24-hour buyer journey; judged on judgement, not completeness.
- **20+ home carousels and cross-sell walls** — the captured home page is a wall of tiles; we ship a
  curated home that gets a shopper to a product in one decision.
- **Browsing-history / "customers also viewed" walls** on cart and orders — noise around the CTA.
- **Prime Video / Alexa / Audible nav items** — not a storefront feature.

## 7. Improved and why

> **EDITABLE SECTION.** Every entry is labelled **CONFIRMED** (recon screenshot cited by exact
> filename), **REPORTED** (the owner's sources say so — not personally tested), or **ASSUMPTION**
> (inferred; no evidence either way). Add your own pain points under §7.1; the numbered list is
> written so single entries can be replaced without touching the rest.

1. **CONFIRMED — Sign-up wall.** Four verification steps before an account exists (puzzle → email OTP
   → phone → WhatsApp) — `5-a-puzzle-after-account-creation.png`,
   `5-email-verification-after-puzzle-correct-completion.png`,
   `5-phone-verification-occurs-after-email-verification.png`,
   `5-mobile-phone-verfication-using-whatsapp.png` → we do **one screen**, email + password,
   confirmation off for the demo.
2. **CONFIRMED — Vanishing header.** `2  search-bar-results-scroll-2-plus-scrolling-downwards-hides-top-bar-and-scrolling-up-shows-it-again.png`
   shows the top bar hiding on scroll-down and reappearing on scroll-up → our header stays; on mobile
   it condenses, never leaves.
3. **ASSUMPTION — Filters invisible on phones.** Only a desktop rail was captured
   (`search-bar-filters-on-right.png`); phone filters are presumably buried → **bottom sheet** with
   the exact same URL-encoded state as the rail.
4. **CONFIRMED — Cart noise.** `Cart page.jpeg` carries cross-sell carousels above and below the fold
   → ours is calm: lines, subtotal, one primary CTA.
5. **CONFIRMED — Checkout anxiety.** `6-checkout-page-address-popup.png` shows a modal address form;
   `6-checkout-page-small-drop-down-for-security-info-appears-once-security-info-clicked-in-topBar.png`
   a floating security tooltip → single-page checkout with trust copy inline next to the pay button.
6. **CONFIRMED — Dead-end orders.** `7-returns-&-Orders-page-from-top-bar-right-corner.png` reads
   "0 orders placed" with no guidance → status **timeline** plus a cancel action that actually
   restores stock.
7. **CONFIRMED — Price confusion.** `Cart page.jpeg` mixes PKR (cart lines) with USD ("Customers who
   viewed…" row) on the same page → **one currency** (ASSUMPTION: **USD**), integer cents, rendered
   consistently server-side.

### 7a. No surprises (theme)

Every improvement above serves one rule: **the shopper never learns about a cost, a fee, or a failed
state after committing.** Concretely — all of this is already in §4's business-rules table:

- Effective price, shipping, tax and the order total are computed server-side and shown **before**
  the pay button; no fee appears after payment.
- Payment expires in 15 minutes and says so; the order exists only after the server verifies the
  payment; stock + order + cart cleanup happen in **one** transaction, so a paid order can never fail
  half-way.
- Cancel is idempotent and restores stock; statuses (`placed → shipped → delivered` / `cancelled`)
  render as a timeline, never a dead end.

Where it lands: **Slice 2** (PDP shows the real cost context), **Slice 5** (cart shows the subtotal
before checkout), **Slice 6** (checkout shows every cost before pay).

### 7b. Not addressed (out of scope)

- **Forwarder workaround** (owner pain #7, REPORTED): two-stage shipping via a package forwarder is
  expensive, returns are hard, and local customs fall on the buyer. Not built — VENDRA ships only
  what its own catalogue ships; real cross-border logistics are outside a demo storefront.

### 7.1 Your pain points

*(Short, plain wording. Labels: **REPORTED** = your sources, not personally tested; **CONFIRMED** =
recon screenshot cited; **ASSUMPTION** = no evidence either way. Source titles as pasted are kept in
`docs/research-notes.md`, not repeated here.)*

1. **REPORTED — You find out too late that an item won't ship to Pakistan.** Many sellers don't ship
   here at all, and "Ships to Pakistan" appears on only some search results while the rest say
   nothing. Your sources even disagree with each other on whether Pakistan is supported — the
   confusion itself is the pain. Not personally tested.
2. **REPORTED — Shipping + import fees can nearly double the price.** Once shipping and an
   import-fees deposit are added, the landed price roughly doubles. Our checkout screenshot
   (`6-checkout-page-address-popup.png`) shows shipping & handling and estimated tax but **no
   import-fees line**, so this stays REPORTED rather than CONFIRMED.
3. **ASSUMPTION — The import-fee deposit rules are confusing.** The deposit is only an estimate: you
   get the difference back if fees come in lower (up to 60 days) and aren't charged extra if they
   come in higher — yet your sources also say customs is still charged on top, which contradicts the
   terms themselves. Untested either way.
4. **REPORTED — Pakistani cards get declined.** A Visa/Mastercard-style card is expected, Cash on
   Delivery isn't offered, and guides suggest workarounds (NayaPay, bank card, Payoneer). Some
   complaints you found came from non-Amazon services and weren't counted.
5. **Sign-up OTP:**
   - **5a CONFIRMED — Sign-up takes multiple verification steps before you can buy.** Puzzle → email
     OTP → phone → WhatsApp, per `5-a-puzzle-after-account-creation.png`,
     `5-email-verification-after-puzzle-correct-completion.png`,
     `5-phone-verification-occurs-after-email-verification.png`,
     `5-mobile-phone-verfication-using-whatsapp.png`.
   - **5b REPORTED — The +92 OTP reportedly never arrives.** Forum reports (mostly seller accounts)
     say Pakistani numbers get no code; no country block is admitted and no workaround is confirmed.
     Buyer side untested.

*PKR/USD mixing and address format — no solid source discussion was found; to be written from my own
experience only.*

## 8. Open questions

- **OPEN QUESTION** — `NOTES.md` never existed; pain points above are recon-derived. Replacement
  text expected from the owner.
- **OPEN QUESTION** — Currency: USD assumed (ASSUMPTION). Confirm or change before Slice 1 pricing.
- **OPEN QUESTION** — Original verbatim brief unavailable; `docs/requirements.md` is a labelled summary.
- **OPEN QUESTION** — DummyJSON *photo* licence is separate from the repo's MIT and not stated
  (images hotlinked per ADR-006; revisit if migrating to Storage).
