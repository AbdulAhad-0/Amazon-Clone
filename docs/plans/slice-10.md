# Slice 10 — Polish + Demo Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (execute inline, task-by-task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A judge-ready build: responsive across breakpoints, every data surface has loading/error/empty states, a README explaining the redesign in writing, a clean incognito run-through, and a prepared walkthrough.

**Architecture:** no new features — audit + fix pass over existing routes (`(shop)`, `(account)`, `api`), then documentation and demo preparation.

**Tech Stack:** existing stack; browser devtools; `docs/evidence/` for screenshots.

**Spec:** `docs/spec.md` §2 (states, mobile-first), F1–F7; `docs/roadmap.md` Slice 10.

## Global Constraints

- Fixes only — no scope additions; anything feature-shaped goes to NICE-TO-HAVE (roadmap).
- Never mark the project done without the final verification commands run and output seen (ADR-013).
- README must never include the Amazon name/logo/orange — "What Amazon does" appears **as plain text in a comparison table only**, which the brief's framing allows; no Amazon copy reused anywhere else (ADR-002).
- **Windows-safe commands; all screenshots → `docs/evidence/`** (ADR-020).

## Review Focus

- No horizontal scroll at 360 px on any MUST route.
- Every list/detail surface shows skeleton → content, empty → helpful copy, error → retry.
- Incognito (no cookies, no localStorage): full journey works end-to-end.
- README table reads clearly in ≤5 minutes.
- Final sweep: lint, typecheck, tests, build, noindex, robots — all green, output captured.

---

### Task 1: Responsive pass (360 / 768 / 1280)

**Files:**
- Modify: any component flagged below; evidence in `docs/evidence/10-responsive/`

- [ ] **Step 1:** Visit every MUST route at each width (devtools): `/`, `/c/electronics`, `/search?q=shirt`, `/p/<slug>`, `/cart`, `/checkout`, `/orders`, `/orders/<id>`, `/signin`.
- [ ] **Step 2:** Fix: horizontal overflow, tap targets < 40 px, filter rail vs bottom-sheet swap, header condensation, table/summary wrapping at 360.
- [ ] **Step 3:** Screenshot each route at 360 + one at 1280 → `docs/evidence/10-responsive/`. Any route left broken → document as known issue in `progress.md`.

### Task 2: Loading / error / empty states audit

**Files:**
- Modify: routes missing a state; `components/shop/Skeletons.tsx` reuse

- [ ] **Step 1:** Matrix: for each surface (home, category, search, PDP, cart, checkout, orders list, order detail, reviews section) confirm: skeleton (`loading.tsx` or inline), empty (0 results / no orders / empty cart), error (`error.tsx` or inline with retry).
- [ ] **Step 2:** Build-throw check: temporarily make a query fail (invalid table name in dev) → error UI renders, not a white screen; revert.
- [ ] **Step 3:** Fix gaps; note the matrix result in `docs/evidence/10-states.md`.

### Task 3: README with the "What Amazon does / What I did / why" table

**Files:**
- Create: `README.md` (repo root)

**Interfaces:**
- Produces: README sections — one-paragraph intro to **Vendra**; run instructions (`npm install`, env names per architecture §10, `npm run seed`, `npm run dev`); deploy note (GitHub → Vercel, env vars in dashboard); **the comparison table**:

  | What Amazon does | What I did | Why |
  |---|---|---|
  | (four-step signup verification) | one-screen email+password | (judgement reason) |
  | (ad/sponsored walls) | curated home | … |
  | … | … | … |

  rows drawn from `spec.md` §6 (cut), §7 (improved), §5 (kept) — plain text only, no assets, no copy lifted from Amazon.

- [ ] **Step 1:** Write the table with ≥8 rows covering cut/kept/improved decisions; cite the spec section in a "Why" footnote line below the table.
- [ ] **Step 2:** Include badges/links: live URL (from progress.md), this repo, `docs/spec.md`.
- [ ] **Step 3:** Owner review check — no Amazon branding beyond the table's plain-text mentions (ADR-002): `Select-String -Path README.md -Pattern "orange|smile"` → no matches.

### Task 4: Incognito full check

- [ ] **Step 1:** Fresh incognito window (no cookies/localStorage): browse → search/filter → PDP → add to cart (follow whatever path Slice 5 shipped: merge or sign-in redirect) → sign up → checkout (success **and** failed card) → order timeline → cancel → review.
- [ ] **Step 2:** Capture each step → `docs/evidence/10-incognito/`; any friction (dead ends, confusing copy, layout break) → fix or log as known issue in `progress.md`.

### Task 5: Walkthrough prep

**Files:**
- Create: `docs/walkthrough-script.md`

- [ ] **Step 1:** Write a ≤5-minute camera-on script: 15 s intro (what the brief was, brand Vendra) → 60 s browse/search → 60 s cart/checkout incl. idempotency + failed card → 45 s orders/cancel + stock restore → 45 s reviews → 30 s "what I cut and why" (point at README table) → 15 s outro (noindex/demo notice).
- [ ] **Step 2:** Prep a **seeded demo account** (documented email only, password NOT in repo) + one pre-placed order for the timeline demo; ensure the Supabase project is **unpaused** (ADR-009) and email confirmation still off (ADR-007).
- [ ] **Step 3:** Dry-run the script against production URL; note timings in the script file.

### Task 6: Final verification sweep

- [ ] **Step 1:**

```powershell
npm run lint; npx tsc --noEmit; npx vitest run; npm run build
```
All clean — paste outputs into `docs/evidence/10-final-checks.txt`.

- [ ] **Step 2:** Production checks (Node fetch): `/` contains `noindex`; `/robots.txt` contains `Disallow: /`; footer demo notice present on a deep page (`/orders` signed out → redirect instead — check `/p/<slug>`).
- [ ] **Step 3:** `git status --porcelain` → no `.env*`, no `.next/`, no `node_modules/` staged.
- [ ] **Step 4:** Update `docs/progress.md`: Slice 10 DONE with cited commands; set overall MUST status; list any known issues. Commit `docs: final polish pass`.
