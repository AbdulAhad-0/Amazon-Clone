# Slice 7 — Orders + Cancel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (execute inline, task-by-task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Order list with status filter, order detail with a **derived** status timeline (`ships_at`/`delivered_at`), and idempotent cancel-before-shipping that restores stock and marks the payment **`refunded`**.

**Architecture:** read paths are RLS `own` selects; statuses are `placed | shipped | delivered | cancelled` with `shipped`/`delivered` **derived from order age** (ADR-015); cancel is one server action calling `cancel_order(p_order_id, p_user_id)` (`SECURITY DEFINER`, `SET search_path = public`, **EXECUTE revoked except `service_role`** — ADR-017): lock order, guard effective status `placed`, set `cancelled` + `cancelled_at`, append `order_events`, restore stock `ORDER BY id`, set payment `refunded` — repeat call is a **no-op**.

**Tech Stack:** Next.js server components + one server action, Postgres function, shadcn badge/table.

**Spec:** `docs/spec.md` F6 + business-rules table; `docs/architecture.md` §1 §2 §6.

## Global Constraints

- Users see **only their own** orders (RLS test required).
- Status comes from the stored value + derived helper — never a client-supplied status; events only record `placed` and `cancelled`, shipped/delivered are drawn from `ships_at`/`delivered_at`.
- Cancel allowed **only while effective status = `placed`** (`now() < ships_at`); cancel twice → idempotent no-op (no double restock, no error).
- Cancel also sets the order's payment to `refunded` (payments.status now includes `refunded`).
- Timeline dates rendered from `timestamptz` server values.
- **Windows-safe commands (Node fetch / Select-String); screenshots → `docs/evidence/`** (ADR-020).
- Never claim idempotent restore without running cancel twice and showing stock unchanged the second time (ADR-013).

## Review Focus

- Not-your-order fetch → empty/404 (test: user B requests A's order id).
- Cancel after `ships_at` (or once derived `shipped`) → rejected (test raises).
- Cancel twice → status `cancelled`, stock restored **exactly once**, second call returns cleanly (test).
- Payment row ends `refunded` after cancel (test).
- `Select-String` on the cancel action/server code for `status` writes → only `cancel_order` writes it.
- Empty orders page → friendly empty state, not a crash (manual).
- Cancelled order still visible with `cancelled` badge; timeline shows the cancel branch (manual).

---

### Task 1: `cancel_order` + orders RLS

**Files:**
- Create: `supabase/migrations/0009_orders_rls.sql` (order/item/event SELECT policies + function)
- Test: `tests/cancel_order.test.ts`

**Interfaces:**
- Produces:

```sql
CREATE FUNCTION cancel_order(p_order_id uuid, p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION cancel_order(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION cancel_order(uuid, uuid) TO service_role;
```

Semantics (architecture §6): lock order; wrong user → raise; **already `cancelled` → return (no-op)**; effective status ≠ `placed` (i.e. `now() >= ships_at`) → raise `'already shipped'`; set `status='cancelled'`, `cancelled_at=now()`; append `order_events('cancelled')`; restore stock (`ORDER BY id`); set payment `status='refunded'`.

- [ ] **Step 1 (failing tests):** ① owner cancels a `placed` order (< 24 h) → status `cancelled`, event appended, stock restored by qty, payment `refunded`; ② **second cancel → clean return, stock identical to post-first-cancel value**; ③ non-owner → raises; ④ order with backdated `created_at` (≥ 24 h, derived shipped) → raises; ⑤ user B `select` of A's order → 0 rows; ⑥ anon `select cancel_order(...)` → permission denied.
- [ ] **Step 2:** Apply migration → run tests → PASS (6/6). Commit.

### Task 2: Orders list (status tabs without `paid`)

**Files:**
- Create: `app/(account)/orders/page.tsx`, `components/orders/OrderCard.tsx`, `components/orders/orderStatus.ts` (derived helper wrapper)
- Create: `loading.tsx`, `error.tsx`

**Interfaces:**
- Produces: `/orders?status=all|placed|shipped|delivered|cancelled` — newest first, 10/page; card shows short id, date, **derived** status badge, item thumbnails, total via `formatCents`.

- [ ] **Step 1:** Server component: `getUser()` → own orders (RLS anyway); status filter applies the **derived** status (SQL helper from architecture §1), not the raw column alone.
- [ ] **Step 2:** Empty state: "No orders yet" + link to `/c/electronics`.
- [ ] **Step 3:** Verify: signed-out hit → proxy redirect (Node fetch: `fetch(...,{redirect:'manual'})` → 307); seeded test order shows; each filter tab works. Screenshots → `docs/evidence/07-orders.png`.
- [ ] **Step 4:** Commit.

### Task 3: Order detail + derived timeline + cancel

**Files:**
- Create: `app/(account)/orders/[id]/page.tsx`, `components/orders/Timeline.tsx`, `components/orders/CancelButton.tsx`, `app/(account)/orders/[id]/actions.ts`

**Interfaces:**
- Produces: `/orders/[id]` — items with `title_snapshot` + `unit_price_cents`, address snapshot, totals, `<Timeline>` built as:
  `placed (created_at)` → `shipped (ships_at)` → `delivered (delivered_at)`; cancelled branch at `cancelled_at` (stops the line; derived shipped/delivered nodes after it are not drawn). Steps already reached are solid; future steps are pending placeholders computed from timestamps — **no fabricated event rows**.
  `<CancelButton>` visible only while derived status = `placed`; action `cancelOrder(orderId)`.

- [ ] **Step 1:** Timeline component takes `{ createdAt, shipsAt, deliveredAt, cancelledAt }` + events; renders labels + formatted dates.
- [ ] **Step 2:** `cancelOrder` server action: `getUser()` → call `cancel_order` via admin client → success → `revalidatePath('/orders')`. Second invocation returns success with unchanged state (function no-op).
- [ ] **Step 3:** `CancelButton`: startTransition + confirm dialog; on success badge flips to `cancelled`, button disappears; if the action errors with `'already shipped'` show "This order has already shipped."
- [ ] **Step 4:** Verify manually (screenshots → `docs/evidence/07-*.png`): cancel a fresh order → status `cancelled`, payment `refunded` (SQL check), **stock on its PDP increased** (note numbers before/after); click cancel twice quickly → stock restored once; force a `created_at` ≥ 24 h test order → cancel button hidden + direct action call rejected.
- [ ] **Step 5:** `npm run lint && npx tsc --noEmit && npx vitest run && npm run build` → clean. Update `docs/progress.md`. Commit.
