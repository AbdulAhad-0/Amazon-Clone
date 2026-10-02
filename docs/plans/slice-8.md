# Slice 8 — Buyer-Only Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (execute inline, task-by-task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Only buyers of a **non-cancelled** order containing the product may review it, once per product — the **server derives the eligible order** (client sends no `orderId`), and a DB trigger rolls reviews into the product rating **combined with the seed baseline**.

**Architecture:** `POST /api/reviews { productId, rating, body }` → admin client finds the user's most recent non-cancelled `order_items` row for that product → `add_review(...)` (`SECURITY DEFINER`, `SET search_path = public`, **EXECUTE revoked except `service_role`**); `UNIQUE(product_id, user_id)` backstops duplicates; a trigger recomputes `rating_avg/rating_count = seed baseline + real reviews` (ADR-018).

**Tech Stack:** server route, Postgres function + trigger, shadcn form/dialog, Vitest (test project).

**Spec:** `docs/spec.md` F7; `docs/architecture.md` §1 §2 §12; ADR-018.

## Global Constraints

- Client posts **`{ productId, rating, body }` only** — no `orderId`, no `userId`; server derives both (F7).
- Only **non-cancelled** orders qualify — cancelled buyers get 403; **seed review rows are skipped** (baseline numbers only, ADR-018).
- One review per `(product_id, user_id)` — DB constraint, not app logic.
- Rating rollup = **trigger** combining `seed_rating_*` with real reviews; never client math, never incremental drift (recompute from rows).
- Verified-purchase badge renders only when `order_id` is present (it always is, by construction).
- **Windows-safe commands; screenshots → `docs/evidence/`** (ADR-020).
- Never claim 403/409 behaviour without running the tests and showing output (ADR-013).

## Review Focus

- Non-buyer POST → 403 and **zero** rows inserted (test).
- Buyer whose only orders are `cancelled` → 403 (test).
- Second review by same buyer → 409, first review untouched (test).
- **Client-supplied `orderId` is ignored** (strip/never read — assert the payload type has no such field).
- Rollup maths with baseline: product with `seed_rating_count=4, seed_rating_avg=4.50` + reviews (5,4,3) →
  `rating_count = 7`, `rating_avg = (4.50×4 + 5+4+3) / 7 ≈ 4.29` (test).
- Deleting a review recomputes correctly (test).
- Duplicate seed re-run does not clobber derived `rating_*` (slice-1 upsert rule).

---

### Task 1: Schema — `add_review` + rollup trigger

**Files:**
- Create: `supabase/migrations/0010_reviews.sql`
- Test: `tests/reviews.test.ts`

**Interfaces:**
- Produces: `reviews(id, product_id, user_id, order_id, rating int check (1..5), body text check (length ≤ 2000), created_at, unique(product_id, user_id))`;
  `add_review(p_product_id uuid, p_rating int, p_body text, p_user_id uuid) RETURNS void` (`SECURITY DEFINER`, `SET search_path = public`, EXECUTE revoked except `service_role` — ADR-017).
- Inside `add_review`: derive `p_order_id` = latest **non-cancelled** order of `p_user_id` containing `p_product_id` → none → `RAISE`; duplicate → unique violation (→ 409); insert; trigger fires.
- Trigger `trg_reviews_rollup` (AFTER INSERT/UPDATE/DELETE on `reviews`): for the affected product(s),
  `rating_count = seed_rating_count + count(reviews)`,
  `rating_avg = CASE WHEN rating_count = 0 THEN seed_rating_avg ELSE (seed_rating_avg*seed_rating_count + coalesce(sum(rating),0)) / rating_count END` (round 2 dp).
- Policy: public SELECT; DELETE own (trigger recomputes); INSERT **only via the function**.

- [ ] **Step 1 (failing tests):**
  1. buyer with non-cancelled order containing product → insert OK; rollup matches baseline maths above (seed 2 baseline rows first).
  2. user without such order → raises (no rows).
  3. product not in that user's any order → raises.
  4. **order `status='cancelled'` → raises** (excluded).
  5. duplicate `(product, user)` → raises (unique).
  6. `p_rating = 6` → raises (check).
  7. anon EXECUTE attempt → permission denied.
  8. DELETE a review → rollup returns to baseline-only numbers.
- [ ] **Step 2:** Run → FAIL; apply migration; implement function + trigger; run → PASS (8/8). Commit.

### Task 2: Review API surface

**Files:**
- Create: `app/api/reviews/route.ts` (POST), `tests/reviews_api.test.ts`
- Create: `lib/reviews.ts` (`getReviews(productId)`, `getRatingSummary(productId)`)

**Interfaces:**
- Produces: `POST /api/reviews { productId, rating, body }` (**explicitly no `orderId`/`userId` field — strip anything extra**) → 201 | **403** (not a buyer / cancelled-only) | **409** (already reviewed) | 400 (validation) | 401.
  Session cookie → `getUser()` for the id → `createAdminClient()` → `add_review` (client never writes reviews).

- [ ] **Step 1 (failing tests):** map each failure mode to its status code; assert 403/409 insert nothing; post with an extra `orderId` field → still succeeds/derives its own order (field ignored).
- [ ] **Step 2:** Implement route: validate `rating 1..5`, `body ≤ 2000`; call function; translate unique-violation → 409, function `RAISE` → 403, other errors → 400/500 without leaking SQL.
- [ ] **Step 3:** Run → PASS. Commit.

### Task 3: PDP review UI

**Files:**
- Create: `components/reviews/ReviewList.tsx`, `components/reviews/RatingSummary.tsx`, `components/reviews/WriteReviewForm.tsx`, `components/reviews/VerifiedBadge.tsx`
- Modify: `app/(shop)/p/[slug]/page.tsx` (render summary + list + form)

**Interfaces:**
- Consumes: `getReviews`, `getRatingSummary` (baseline + reviews already combined server-side), `POST /api/reviews`.
- Produces: PDP sections — histogram bars (5→1), average + count via server values, list with `VerifiedBadge`, form only when signed in; signed-in but ineligible → "Only verified buyers can review this product."; signed out → sign-in link with `?next=/p/<slug>`.

- [ ] **Step 1:** `WriteReviewForm`: star picker + body textarea + submit → `POST { productId, rating, body }`; 403 → inline notice; 409 → "You've already reviewed this product"; 201 → `router.refresh()`, new review highlighted.
- [ ] **Step 2:** RatingSummary renders `rating_avg/rating_count` exactly as returned (they include the seed baseline — note in component comment).
- [ ] **Step 3:** Verify manually (screenshots → `docs/evidence/08-*.png`): buyer with a completed order writes a review → appears with badge + histogram/count update; second attempt → 409 notice; cancelled-order buyer → 403 notice; signed-out → sign-in link.
- [ ] **Step 4:** `npm run lint && npx tsc --noEmit && npx vitest run && npm run build` → clean.
- [ ] **Step 5:** Update `docs/progress.md` (slice 8 + full MUST list status). Commit.

### Task 4: End-to-end demo path (gate before Slice 10 / optional Slice 9)

- [ ] **Step 1:** Walk the whole journey fresh: sign up → browse → search/filter → add to cart → checkout (happy + failed card + double-submit) → order timeline → cancel → review. Capture screenshots into `docs/evidence/walkthrough/`.
- [ ] **Step 2:** Record findings in `docs/progress.md`; only then consider Slice 9 (Stripe) planning or Slice 10 polish.
