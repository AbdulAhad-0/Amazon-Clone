# Slice 6 — Checkout (Mock Payment) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (execute inline, task-by-task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in buyer enters an address, a **server-side mock payment** is created (15-min expiry, card data never stored/logged) and verified, and one Postgres transaction produces the order — reading the cart itself, computing prices/shipping/tax per spec business rules — idempotently.

**Architecture:** `payments` table (+`expires_at`, status incl. `refunded`); `POST /api/checkout/pay` creates a `succeeded` payment using **server-computed** amount (effective prices + shipping + tax, ADR-016); `place_order(p_payment_id, p_address, p_user_id)` — `SECURITY DEFINER`, `SET search_path = public`, **`REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role`** (ADR-017) — re-verifies payment (user, amount, expiry), locks products `FOR UPDATE ORDER BY id`, inserts order/items/event, decrements stock, clears cart; `orders.payment_id UNIQUE` is the idempotency key.

**Tech Stack:** Postgres functions (`pgcrypto`), Next.js route handler + server action, shadcn form.

**Spec:** `docs/spec.md` F5 + business-rules table; `docs/architecture.md` §2 §5; ADR-010/016/017.

## Global Constraints

- Order exists **only** after server verification of payment; creation + stock + cart cleanup in **ONE transaction** (brief hard rule).
- Client can never set an amount or line items — `place_order` takes **no `p_items`**: it reads `cart_items` itself and recomputes total from `effective_price_cents` + shipping (free ≥ 3500¢ else 599¢) + tax (8%) (ADR-016/017).
- **Card data: validated, then discarded — never persisted, never logged, never echoed** (only `payments.status`/`amount_cents` are written).
- Payments expire after **15 minutes** (`expires_at = created_at + 15 min`); `place_order` rejects expired payments with no writes.
- `payments` and `orders` are service-role-write-only under RLS (architecture §2).
- Address saved to `addresses` AND snapshotted into `orders.ship_address`.
- **Windows-safe verification (Node fetch, Select-String — no curl/grep); screenshots → `docs/evidence/`** (ADR-020).
- Never claim idempotency/transaction safety without running the test twice and showing output (ADR-013).

## Review Focus

- **Double submit** (double-click pay, or replay the same `payment_id`) → exactly **one** order (test runs `place_order` twice, asserts `count(*) = 1`).
- **Insufficient stock** injected → no order row, no stock change, no cart deletion (test asserts all three unchanged).
- **Expired payment** (backdate `expires_at`) → raises, zero writes (test).
- **Tampered amount**: client posts `amountCents: 1` → ignored; payment amount = server total (test).
- Signed-out `POST /api/checkout/pay` → 401, no `payments` row (Node fetch test).
- **No card data anywhere:** `Select-String -Path . -Include *.ts,*.tsx -Pattern "4242" -Recurse` matches only the demo rule constant; no `console.log` in the pay route; DB has no card columns (schema review).
- Stock check happens **inside** the transaction (`ORDER BY id FOR UPDATE`): two payments for the last unit → one succeeds, one raises (test).

---

### Task 1: payments + orders schema

**Files:**
- Create: `supabase/migrations/0007_payments_orders.sql`
- Test: `tests/checkout_schema.test.ts`

**Interfaces:**
- Produces: `payments(id uuid PK, user_id, amount_cents, status check in ('pending','succeeded','failed','refunded'), expires_at timestamptz, created_at)`;
  `orders(… status check in ('placed','shipped','delivered','cancelled'), created_at, ships_at, delivered_at, cancelled_at, ship_address jsonb, payment_id uuid unique references payments, …)`;
  `order_items(… unit_price_cents = effective-price snapshot, …)`, `order_events(…)` per architecture §1; RLS per architecture §2 (no client inserts).

- [ ] **Step 1 (failing test):** as authenticated user via anon key: `insert into payments …` → **rejected** (RLS); service key insert → OK; `status='paid'` → rejected by check constraint.
- [ ] **Step 2:** apply migration → PASS. Commit.

### Task 2: `place_order` function (service-role-only, reads cart itself)

**Files:**
- Create: `supabase/migrations/0008_place_order.sql`
- Test: `tests/place_order.test.ts`

**Interfaces:**
- Produces:

```sql
CREATE FUNCTION place_order(p_payment_id uuid, p_address jsonb, p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION place_order(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION place_order(uuid, jsonb, uuid) TO service_role;
```

- No `p_items` — reads `cart_items` for `p_user_id`; computes lines with `effective_price_cents(price_cents, discount_pct)`, then shipping + tax per spec business-rules table; compares against `payments.amount_cents`.

- [ ] **Step 1 (failing tests):**
  1. happy path: seed `succeeded` payment (amount = server total) + 2 cart lines → returns uuid; order/items/event exist; `ships_at = created_at + 15 min`, `delivered_at = created_at + 2 h`; stock decreased by qty; cart empty.
  2. idempotency: call again same `p_payment_id` → same uuid, `orders count = 1`, stock **not** decreased twice.
  3. bad payment (`status='pending'`) → raises, zero writes.
  4. expired payment (backdated `expires_at`) → raises, zero writes.
  5. insufficient stock → raises, order/items/cart/stock all unchanged.
  6. amount mismatch (payment amount ≠ server-computed total) → raises.
  7. wrong `p_user_id` (payment belongs to another user) → raises.
  8. **anon EXECUTE attempt:** `set role anon; select place_order(...)` → permission denied (posture proof).
- [ ] **Step 2:** Run `npx vitest run tests/place_order.test.ts` → FAIL (function missing).
- [ ] **Step 3:** Implement SQL exactly in architecture §5 order: verify payment → compute+compare total → `SELECT … FROM products WHERE id IN (…) ORDER BY id FOR UPDATE` stock check → insert order (unique violation → return existing id) → items + event → decrement → delete cart. All inside the function (one connection, one transaction).
- [ ] **Step 4:** Run → PASS (8/8). Commit.

### Task 3: mock payment endpoint

**Files:**
- Create: `app/api/checkout/pay/route.ts`, `tests/pay_api.test.ts`

**Interfaces:**
- Produces: `POST /api/checkout/pay` body `{ card: { number, exp, cvc } }` (no amount!) → 200 `{ paymentId }` | 401 | 422 `{ error }` (empty cart / insufficient stock pre-check for UX) | 400 invalid demo card.
- Demo rules: `4242 4242 4242 4242` → succeeded; `4000 0000 0000 0002` → failed; others → 400. **Card fields are used in-memory for the rule check, then dropped — never written to DB, never logged** (only the decision + server-computed amount are persisted; `expires_at = now() + 15 min`).
- Amount recomputed server-side: cart lines at `effective_price_cents` + shipping (free ≥ 3500¢ else 599¢) + tax (8% rounded) — same helper path as `place_order` (ADR-016).

- [ ] **Step 1 (failing tests):** signed-in + valid demo card → `paymentId`, row amount equals server cart total, `expires_at ≈ now+15min`; `amountCents` field in body ignored; signed-out → 401; `Select-String` on the route file finds **no** `console.log` mentioning card fields.
- [ ] **Step 2:** Implement: verify session via `getUser()`; if no user → 401; compute total; create payment via `createAdminClient()` (payments are service-write-only — ADR-008).
- [ ] **Step 3:** Run → PASS. Commit.

### Task 4: checkout UI (single page)

**Files:**
- Create: `app/(account)/checkout/page.tsx`, `components/checkout/AddressForm.tsx`, `components/checkout/OrderSummary.tsx`, `components/checkout/PayPanel.tsx`
- Create: `app/(account)/checkout/actions.ts` (`saveAddress`, `placeOrder`)

**Interfaces:**
- Consumes: `getCart`, `POST /api/checkout/pay`, `place_order` via admin client in a server action (service-role — the only caller).

- [ ] **Step 1:** Page sections: address form (full name, phone, line1, line2, city, state, zip, country; saves to `addresses` + default flag) → order summary (server-rendered: effective subtotal, shipping per threshold, tax 8%, **server total** + "Free shipping over $35" line) → `PayPanel` with demo-card hint and **trust copy inline** (spec §7.5), one primary button. Note under the card fields: "Demo only — card details are never stored or logged."
- [ ] **Step 2:** Pay flow: `pay()` → `paymentId` → server action `placeOrder(paymentId, address)` (no items!) → success → `router.replace('/orders/' + orderId)`; `{code:'STOCK'}` → friendly error (no partial state); duplicate → redirect to the same existing order.
- [ ] **Step 3:** Guard: proxy already redirects signed-out users (Slice 4); action re-checks `getUser()`.
- [ ] **Step 4:** Verify manually (screenshots → `docs/evidence/06-*.png`): full happy path; double-click pay rapidly → ONE order; card `…0002` → payment-failed message, cart intact; leave checkout 15+ min (or backdate) → expired-payment error, no order.
- [ ] **Step 5:** `npm run lint && npx tsc --noEmit && npx vitest run && npm run build` → clean. Update `docs/progress.md`. Commit.
