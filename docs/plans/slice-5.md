# Slice 5 — Cart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (execute inline, task-by-task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistent signed-in cart (Postgres + RLS) with optimistic quantity updates, a **server-side stock check inside every action**, a live header cart badge, and — as a clearly separate **optional** task — a client-only guest cart + merge.

**Architecture:** `cart_items` table + RLS own-rows; server actions (`addToCart`/`setQty`/`getCart`) verify `getUser()` and re-check stock themselves; guest cart (if kept) lives **entirely in client code** and merges on sign-in; header badge = server count (signed-in) / client count (guest). Optimistic UI via a tiny reducer + server reconcile.

**Tech Stack:** React server actions, `@supabase/ssr` `getUser()`, localStorage (client only), shadcn button/sheet.

**Spec:** `docs/spec.md` F4; `docs/architecture.md` §2 §4; ADR-012 (amended).

## Global Constraints

- Subtotal **always** from server: `SUM(qty * effective_price_cents(...))` — never trust client totals (ADR-004/016).
- **Stock check lives inside the server action** — `setQty`/`addToCart` reject `qty > stock` server-side and return an error the UI shows; disabled buttons are cosmetic only (architecture §4).
- `UNIQUE(user_id, product_id)` enforced in DB; writes go through RLS-owned policies only.
- Optimistic change must roll back visibly on server error.
- **Guest cart + merge is OPTIONAL (separate Task 5).** **If cut:** signed-out "Add to cart" redirects to `/signin?next=<p/[slug]>` and returns the user to the PDP after sign-in — no localStorage cart exists at all.
- Integration tests use the **separate test Supabase project** (ADR-020).
- **Windows-safe commands; screenshots → `docs/evidence/`** (ADR-020).
- Never claim persistence across reload without reloading and seeing it (ADR-013).

## Review Focus

- Add → reload → line still there (signed-in) — manual test.
- Set qty to 0 → line removed; **qty > stock → server rejects** (error + rollback even if the button state was forged) — test.
- Header badge matches server count after every action (manual, both add and remove).
- Two tabs: change qty in A, refresh B → converges (no duplicate rows).
- Subtotal shown equals server number after every optimistic update (assert in test).
- (Only if Task 5 kept) sign-in merge: guest 2 items + account 1 existing → merged quantities, storage cleared.
- (If Task 5 cut) signed-out add → redirected to sign-in → returns to PDP with cart empty (manual).

---

### Task 1: Schema + RLS

**Files:**
- Create: `supabase/migrations/0006_cart.sql`
- Test: `tests/cart_rls.test.ts`

**Interfaces:**
- Produces: `cart_items(id, user_id, product_id, qty int check (qty > 0), added_at, unique(user_id, product_id))`; RLS: own rows only, all four verbs.

- [ ] **Step 1 (failing test):** user A inserts own row OK; user A cannot read/update/delete B's row (0 rows affected).
- [ ] **Step 2:** apply migration → test PASS. Commit.

### Task 2: Server actions (signed-in, stock-checked)

**Files:**
- Create: `app/(shop)/cart/actions.ts`, `lib/cart.ts` (types + subtotal helper only)

**Interfaces:**
- Produces: `addToCart(productId, qty): Promise<Result>`, `setQty(productId, qty)` (0 = remove), `getCart(): Promise<CartLine[]>`, `getSubtotalCents(lines): Promise<number>`; `Result = { ok: true, lines: CartLine[] } | { ok: false, error: 'STOCK' | 'AUTH' | 'SERVER' }`.
- `CartLine = { productId, title, slug, priceCents, qty, imageUrl, stock }`.

- [ ] **Step 1:** Every action starts with `getUser()`; no user → `{ ok:false, error:'AUTH' }` (UI redirects when Task 5 is cut, otherwise merge is used).
- [ ] **Step 2:** **Stock check inside the action:** read `products.stock` for the target product in the same transaction-ish flow; `qty > stock` → `{ ok:false, error:'STOCK' }`, no write.
- [ ] **Step 3:** `getSubtotalCents` joins `products` and applies `effective_price_cents` logic server-side (single source — architecture §5).
- [ ] **Step 4:** Unit tests: malformed guest-storage JSON → `[]` (no throw) for the helper; subtotal maths matches `lib/money` expectations.
- [ ] **Step 5:** Run `npx vitest run tests/cart*` → PASS. Commit.

### Task 3: Cart page + optimistic UI

**Files:**
- Create: `app/(shop)/cart/page.tsx`, `components/shop/CartLineRow.tsx`, `components/shop/OptimisticQty.tsx`, `hooks/useOptimisticCart.ts`

**Interfaces:**
- Consumes: actions from Task 2. Produces: `/cart` with lines, qty steppers, remove, subtotal, free-shipping progress line ("$X away from free shipping" — spec business rules), **Proceed to checkout** linking to `/checkout`.

- [ ] **Step 1:** Page: loading skeleton, empty state ("Your cart is empty" + link to `/c/electronics`), rows with `ProductImage`, price via `formatCents`, line total, remove.
- [ ] **Step 2:** `useOptimisticCart`: apply qty change locally → call action → reconcile with returned `CartLine[]`; on `{ok:false}` revert + toast (`STOCK` → "Only N left").
- [ ] **Step 3:** Wire PDP `BuyBox` (Slice 2) to `addToCart` with qty; button shows "Added ✓" briefly.
- [ ] **Step 4:** Verify manually: signed-in add → reload persists; qty→0 removes; set qty > stock → rollback toast. Screenshots → `docs/evidence/05-cart.png`.
- [ ] **Step 5:** Commit.

### Task 4: Header cart badge

**Files:**
- Create: `components/layout/CartBadge.tsx`
- Modify: `components/layout/Header.tsx`

- [ ] **Step 1:** Badge shows line count: server-rendered for signed-in users (layout read), updated optimistically from client state after cart actions; hidden at 0.
- [ ] **Step 2:** Manual test: add 2 lines → badge = 2; remove one → badge = 1; reload → matches server.
- [ ] **Step 3:** Commit `feat: header cart badge`.

### Task 5 (OPTIONAL — cut path documented): Guest cart + merge

**Files:**
- Create: `lib/guestCart.ts` (client-only), `hooks/useGuestCart.ts`
- Create: `app/(shop)/cart/merge.ts` (server action `mergeGuestCart`)

**Interfaces:**
- Produces: client guest cart on `localStorage` (`vendra.cart`); `mergeGuestCart(guest: {productId, qty}[])` upserts into `cart_items` then clears storage (idempotent via `UNIQUE(user_id, product_id)`).

- [ ] **Step 0 — DECISION:** run this task **only** if time allows; it is explicitly not required by the MUST list.
- [ ] **Step 1:** If kept: guest add-to-cart writes localStorage client-side (**no server involvement**); on first authenticated cart read, call `mergeGuestCart`; verify merged quantities + storage cleared.
- [ ] **Step 2:** If **cut** (default path): signed-out `addToCart` returns `{ ok:false, error:'AUTH' }` → `BuyBox` redirects to `/signin?next=/p/<slug>`; after sign-in the user lands back on the PDP. Remove any dead guest-cart code. Record the decision in `docs/progress.md` (`guest cart: KEPT` / `CUT`).
- [ ] **Step 3:** Commit whichever path was taken.

### Task 6: Verification

- [ ] **Step 1:** `npm run lint && npx tsc --noEmit && npx vitest run && npm run build` → clean.
- [ ] **Step 2:** Badge + stock-reject + reload persistence all demonstrated (screenshots in `docs/evidence/`).
- [ ] **Step 3:** Update `docs/progress.md`. Commit.
