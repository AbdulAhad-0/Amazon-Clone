# Slice 3 — Search, Filters, Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (execute inline, task-by-task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** URL-driven search with filters and sort: desktop left rail, mobile bottom sheet, debounced header suggestions via a small `/api/suggest` endpoint, result counts, empty state with clear-filters.

**Architecture:** one server-side filter module `lib/search.ts` (**whitelisted params + `escapeLike()` — never string-built `.or()` filters**) shared by the server-rendered `/search` page and `GET /api/suggest`; client filter components write to the URL via `router.replace` (shallow), so back/forward restores everything. **There is no `/api/search`** — results are server-rendered (spec F2).

**Tech Stack:** Next.js route handlers/server components, URLSearchParams, shadcn Sheet/RadioGroup/Slider, 250 ms debounce hook.

**Spec:** `docs/spec.md` F2; `docs/architecture.md` §8.

## Global Constraints

- All filter/sort state lives **only** in the URL — no hidden client state for query results (F2 AC).
- Price params arrive in dollars, convert to cents once inside `lib/search.ts` (ADR-004).
- Sort values whitelist: `relevance | price_asc | price_desc | rating | newest`; unknown → `relevance`.
- **No raw `.or()` interpolation:** every dynamic value passes `escapeLike()` (escapes `% _ , ( ) \ " '`) and inputs are whitelisted; a test feeds injection payloads (`men's`, `a,b`, `%`, `DROP TABLE`).
- `group` param is a **nav-group slug** (Slice 2 routes).
- Money rendering via `formatCents` only.
- **Windows-safe commands only (Node fetch, no curl); screenshots → `docs/evidence/`** (ADR-020).
- Never claim URL-state round-trip works without running the back/forward test manually (ADR-013).

## Review Focus

- Round-trip: load `?q=x&group=electronics&min=20&max=100&sort=price_asc`, press Back, all controls restored (manual test, screenshot).
- Injection safety: `q=men's`, `q=a,b`, `q=%25` → HTTP 200, sensible results (tests in `tests/search.test.ts`).
- Invalid params: `min=abc`, `sort=DROP TABLE`, `rating=9` → defaults, HTTP 200 (test).
- Mobile: filter sheet writes identical params as rail (inspect URL in both).
- Suggestions: `/api/suggest?q=shi` → ≤8 `{slug,title}`; empty `q` → 400; no matches → `[]` (Node fetch test).
- Debounce: one keystroke burst issues ≤2 suggestion requests (network tab evidence).

---

### Task 1: Filter module + escaping

**Files:**
- Create: `lib/search.ts`, `tests/search.test.ts`

**Interfaces:**
- Produces: `escapeLike(input: string): string`; `applyFilters(qb, params: SearchParams)` returning `{ items, total, page, pageSize }` via the Supabase builder with **validated** filters; `SearchParams = { q?, group?, brand?, min?, max?, rating?, sort?, page? }` (all strings).

- [ ] **Step 1 (failing tests):** defaults (empty params → no filters, `sort=relevance`); `min/max` dollars→cents; `sort=DROP TABLE` → `relevance`; `rating=9` ignored; `escapeLike("men's")` → no raw `'` passthrough; `escapeLike('a,b(c)%')` escapes every reserved char.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `lib/search.ts` — whitelist-driven; brand/group values validated against DB values before use; **never build an `.or()` string from raw input** (escape first, or query columns separately and intersect).
- [ ] **Step 4:** Run → PASS. Commit.

### Task 2: Search page (server-rendered, no `/api/search`)

**Files:**
- Create: `app/(shop)/search/page.tsx`, `components/shop/ProductGrid.tsx`
- Do **not** create `app/api/search/route.ts` (explicitly dropped — spec F2).

**Interfaces:**
- Produces: `/search?…` server-rendered grid + heading with count.

- [ ] **Step 1:** Server component awaits `searchParams` (async — ADR-019); shared fetch via `applyFilters`; heading "N results for “q”"; grid reuses `ProductCard`.
- [ ] **Step 2:** Empty result → empty state component with **Clear all filters** link to `/search` (keeps `q` if present).
- [ ] **Step 3:** Verify: open `/search?q=shirt&sort=price_asc` in browser → results; `q=zzzznotfound` → empty state, HTTP 200.
- [ ] **Step 4:** Commit.

### Task 3: Header suggestions endpoint

**Files:**
- Create: `app/api/suggest/route.ts`, `components/layout/SearchSuggest.tsx`, `hooks/useDebouncedValue.ts`
- Modify: `components/layout/Header.tsx`

**Interfaces:**
- Produces: `GET /api/suggest?q=…` → `200 { items: {slug,title}[] }` (≤8, ranked by relevance) | `400` when `q` missing/`>50 chars` | `200 []` no matches. Uses `escapeLike` + anon read (public RLS).

- [ ] **Step 1:** Route handler: validate + escape `q`, `select slug, title … ilike … limit 8`.
- [ ] **Step 2:** `SearchSuggest`: input in Header; `useDebouncedValue(q, 250)`; Enter or result click → `/search?q=…`; list renders only for `q.length ≥ 2`.
- [ ] **Step 3: Verify (Node fetch, no curl)** — with dev server running:
  `node -e "fetch('http://localhost:3000/api/suggest?q=shi').then(r=>r.json()).then(d=>console.log(d.items.length<=8&&d.items.every(i=>i.slug&&i.title)))"` → `true`;
  `node -e "fetch('http://localhost:3000/api/suggest?q=%27%20OR%201%3D1').then(r=>r.status).then(console.log)"` → `200` with `[]` (escaped, no error).
- [ ] **Step 4:** Commit `feat: header suggestions endpoint + UI`.

### Task 4: Filter rail (desktop) + bottom sheet (mobile)

**Files:**
- Create: `components/shop/FilterRail.tsx`, `components/shop/FilterSheet.tsx`, `components/shop/ActiveFilters.tsx`

**Interfaces:**
- Consumes: `applyFilters` param names; produces URL updates via `router.replace('/search?'+params, { scroll: false })`.

- [ ] **Step 1:** Rail contents: nav-group select (slugs), brand checkboxes (brands from current result set), price min/max inputs (dollars), rating radio (≥4, ≥3, any), sort select. Every control writes its param on change; Clear-all resets.
- [ ] **Step 2:** Mobile: same controls inside shadcn `Sheet` (bottom-anchored) triggered by a sticky "Filters" button; hidden rail on `<md`.
- [ ] **Step 3:** `useDebouncedValue` powers suggestions only; filters apply immediately (single navigation each).
- [ ] **Step 4:** `ActiveFilters` chips show active params with individual × removal.
- [ ] **Step 5:** Commit `feat: filter rail + bottom sheet`.

### Task 5: Verification

- [ ] **Step 1:** Manual matrix (screenshots → `docs/evidence/`): desktop rail apply → URL updates → back restores; mobile sheet apply → same URL shape; invalid params → 200 defaults; `q=men's` → 200.
- [ ] **Step 2:** `npm run lint && npx tsc --noEmit && npx vitest run && npm run build` → clean.
- [ ] **Step 3:** Update `docs/progress.md`. Commit.
