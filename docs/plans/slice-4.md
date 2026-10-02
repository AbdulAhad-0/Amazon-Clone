# Slice 4 — Auth + RLS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (execute inline, task-by-task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-screen sign-up / sign-in / sign-out with email confirmation OFF, a `profiles` row per user (with display name), proxy guards with validated `?next=` returns, and RLS proven by test.

**Architecture:** Supabase email+password via `@supabase/ssr`; server reads use **`getUser()`**; DB trigger creates `profiles`; **`proxy.ts`** (Next 16) refreshes cookies + coarse-redirects while real auth checks live in server actions with `getUser()`; `lib/supabase/admin.ts` is service-role + **`import 'server-only'`** (ADR-008/019).

**Tech Stack:** `@supabase/supabase-js`, `@supabase/ssr`, Next.js proxy, shadcn form components, Vitest (separate test project).

**Spec:** `docs/spec.md` F3; `docs/architecture.md` §2 §3 §10; ADR-007/008/019/020.

## Global Constraints

- **Prerequisite (owner, dashboard): disable Supabase "Confirm email"** — ADR-007. Slice blocked until done; record it in `progress.md`.
- `SUPABASE_SERVICE_ROLE_KEY` never in `NEXT_PUBLIC_*`, never imported in `app/` or `components/` (ADR-008); `admin.ts` starts with `import 'server-only'`.
- Never print/log env values or auth tokens at any step.
- No CAPTCHA, no OTP, no phone step, **no confirm-password field** (spec §6 cut list + F3 revision: show/hide toggle instead).
- `?next=` must start with exactly one `/` and not `//` or `/\` — otherwise fall back to `/` (open-redirect guard, architecture §3).
- Integration tests use the **separate test Supabase project** (ADR-020).
- **Windows-safe commands (Node fetch / Select-String, no curl/grep); screenshots → `docs/evidence/`** (ADR-020).
- Never claim auth works without running the flow and seeing the session (ADR-013).

## Review Focus

- Guard actually redirects: signed-out `GET /orders` → 307 to `/signin?next=%2Forders` (Node fetch test).
- `?next=//evil.com` and `?next=/\evil` → land on `/` after sign-in (test).
- After sign-in with valid `next`, land back on `/orders` (manual test).
- Client bundle contains no service key — `npm run build` then `Select-String -Path .next\static -Pattern SERVICE_ROLE -Recurse` → no match.
- `profiles` row auto-created with display name (name field or email prefix) — test: sign up, `select count(*), display_name from profiles where id = auth.uid()` = 1.
- Sign-out actually clears — manual: header flips to "Sign in", protected route redirects again.

---

### Task 1: profiles schema + trigger + RLS

**Files:**
- Create: `supabase/migrations/0005_profiles.sql`
- Test: `tests/rls_profiles.test.ts`

**Interfaces:**
- Produces: `profiles(id uuid PK references auth.users, display_name text, created_at timestamptz default now())`; trigger `on auth.users after insert` → insert profile (display_name from `raw_user_meta_data->>'full_name'` if present); RLS: SELECT/UPDATE own only.

- [ ] **Step 1 (failing test):** insert a user via service key (test project) → expect one `profiles` row; second client with a *different* session cannot `select` that row (empty set).
- [ ] **Step 2:** Apply migration; run test → PASS (or fix).
- [ ] **Step 3:** Commit.

### Task 2: admin client + proxy guards

**Files:**
- Create: `lib/supabase/admin.ts`, `lib/supabase/getUser.ts`
- Modify: `proxy.ts` (the guard file from Slice 0 — rename to `middleware.ts` only if scaffolded on Next 15.x)

**Interfaces:**
- Produces: `createAdminClient()` (throws if service key missing — no fallback, no logging of value) prefixed by `import 'server-only'`; `getUser()` for server components/actions via `@supabase/ssr`; proxy refreshes session cookies and redirects unauthenticated hits on `['/checkout','/orders','/account','/reviews']` → `/signin?next=<pathname>`.

- [ ] **Step 1:** `admin.ts`: `import 'server-only'` as the first line, then browser guard `if (typeof window !== 'undefined') throw`.
- [ ] **Step 2:** `getUser.ts`: `createServerClient(...).auth.getUser()` — **server-verified**, never accepts an id from the client (architecture §3).
- [ ] **Step 3:** Proxy: cookie refresh everywhere + coarse redirect for the guard list; matcher excludes static assets.
- [ ] **Step 4: Verify guard (Node fetch, no curl):** with dev server running —
  `node -e "fetch('http://localhost:3000/orders',{redirect:'manual'}).then(r=>console.log(r.status, r.headers.get('location')))"` → `307` + `/signin?next=%2Forders`.
- [ ] **Step 5:** `Select-String -Path app,components -Pattern SERVICE_ROLE -Include *.ts,*.tsx -Recurse` → no matches. Commit.

### Task 3: Sign-up / sign-in / sign-out screens

**Files:**
- Create: `app/(account)/signin/page.tsx`, `app/(account)/signup/page.tsx`, `components/auth/AuthForm.tsx`
- Create: `app/(account)/actions.ts` (server actions: `signIn`, `signUp`, `signOut`)

**Interfaces:**
- Produces: `signIn(prev, formData): { error?: string }`, `signUp(prev, formData)`, `signOut(): Promise<void>`; `safeNext(input: string): string` (single-leading-`/` guard).

- [ ] **Step 1:** `AuthForm`: email + password with a **show/hide toggle** (no confirm-password field — F3 revision); optional **name** field on signup (fallback: email prefix → `profiles.display_name`); inline error slot; one screen each.
- [ ] **Step 2:** Redirects use `safeNext`: allow only values matching `^\/(?!\/)` and not starting `/\` — everything else → `/`.
- [ ] **Step 3:** `signUp` → `supabase.auth.signUp({ email, password, options: { data: { full_name: name } } })` → redirect to validated `next ?? '/'`; email-confirmation response (`session: null`) treated as a **hard error message**: "Email confirmation must be disabled in Supabase (ADR-007)".
- [ ] **Step 4:** Verify end-to-end manually: sign up with name → header shows that name; sign up with empty name → header shows email prefix; `?next=//evil.com` → lands on `/`; `/orders` protected; sign out redirects. Screenshots → `docs/evidence/04-auth.png`.
- [ ] **Step 5:** Commit `feat: auth screens + guards`.

### Task 4: Session exposure to UI

**Files:**
- Create: `components/layout/AccountMenu.tsx` (modify Header)
- Modify: `app/layout.tsx` to pass user to Header via server read (`getUser()`).

- [ ] **Step 1:** Header shows `Sign in` or `Hello, {displayName}` + menu (Orders, Account, Sign out).
- [ ] **Step 2:** Manual test: signed-in header persists across reload; sign-out from menu works.
- [ ] **Step 3:** `npm run lint && npx tsc --noEmit && npx vitest run && npm run build` → clean. Update `docs/progress.md`. Commit.
