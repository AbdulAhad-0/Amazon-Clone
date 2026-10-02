# Slice 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (execute inline, task-by-task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed Next.js + TypeScript-strict app connected to Supabase, with brand tokens, noindex/robots protections and a header/footer shell.

**Architecture:** Next.js App Router project scaffolded manually (no create-next-app ambiguity) on the **current stable Next (16.x)**; guard file **`proxy.ts`** per installed version (check first — ADR-019); Tailwind + shadcn/ui tokens mapped to Vendra palette; Supabase via **`@supabase/ssr`**; deploy through the **Vercel GitHub integration** (push → dashboard import → env vars entered by the owner in the dashboard).

**Tech Stack:** Next.js (App Router), TypeScript strict, Tailwind CSS, shadcn/ui, `@supabase/ssr`, `@supabase/supabase-js`, Vitest, Vercel + GitHub.

**Spec:** `docs/spec.md` (§2 design direction, §4 F1); `docs/architecture.md` §1 §3 §9 §10.

## Global Constraints

- TypeScript strict; no `any` in app code.
- All money integer cents, server-computed (ADR-004) — no money code in this slice.
- Never the words/colours of Amazon: no orange, no teal, no smile (ADR-001/002); accent `#3B3FA8`, paper `#FAF8F4`, ink `#17181D`.
- Never read/print/log `.env*`; `.env.example` holds **names only**, empty placeholders (ADR-008, architecture §10).
- `noindex` on every page; `robots.txt` disallows all; footer demo notice (ADR-002).
- **Windows-safe verification only:** PowerShell (`Select-String`, `Invoke-WebRequest`) or small Node scripts — no `grep`/`curl`/`sleep` (ADR-020).
- **Screenshots and command output go to `docs/evidence/`** — never `.agent-logs/` (ADR-020).
- Never mark a step passed without running its command and seeing output (ADR-013).

## Review Focus

- Env leak: `NEXT_PUBLIC_` vars contain only `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SITE_URL` — test: `Select-String` over `.env.example` and `lib/supabase/*` for `SERVICE_ROLE`.
- `.env*` and `.next/` truly ignored — test: `git status --porcelain` shows neither after a build.
- noindex truly on every route — test: build, start, Node fetch script hits `/` and `/robots.txt`.
- Dark/hex hardcoding — test: `Select-String -Path components/**/*.tsx -Pattern '#[0-9A-Fa-f]{6}'` → only allowed files.
- Deploy actually live — Node fetch of the production URL + `/robots.txt`, screenshot into `docs/evidence/`.

---

### Task 1: `.gitignore` first, then scaffold

**Files:**
- Create: **`.gitignore` (very first file)**, `package.json`, `tsconfig.json` (strict: true), `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `components.json`, `vitest.config.ts`
- Create: `app/robots.ts`

**Interfaces:**
- Produces: runnable `npm run dev`; `npm test` → vitest; root layout with metadata.

- [ ] **Step 1 (BEFORE anything else): create `.gitignore`** containing at least:
  `.env`, `.env.*`, `!.env.example`, `.next/`, `node_modules/`, `out/`, `*.tsbuildinfo`,
  `.vercel/`, `docs/evidence/*.tmp` — so no secret or build artifact can ever be staged.
- [ ] **Step 2: Init project**

```powershell
npm install next@latest react@latest react-dom@latest
npm install -D typescript @types/node @types/react @types/react-dom tailwindcss @tailwindcss/postcss vitest @vitejs/plugin-react
```

- [ ] **Step 3:** Record the installed version — `npx next --version`.
  Expected: `16.x` → this plan uses **`proxy.ts`**; if `15.x` → use `middleware.ts` instead and
  note the deviation in `docs/progress.md` (ADR-019).
- [ ] **Step 4:** Write `tsconfig.json` with `"strict": true` plus path alias `@/*`; write
  `vitest.config.ts` with the `@/*` alias (tests will live in `tests/`).
- [ ] **Step 5: Verify typecheck + test runner**

```powershell
npx tsc --noEmit
npx vitest run
```
Expected: tsc no output/exit 0; vitest exits 0 with "no tests found" (config resolves).

- [ ] **Step 6:** Commit
  `git add -A && git commit -m "chore: gitignore first, scaffold next.js app (strict ts, vitest)"`

### Task 2: Brand tokens + shell

**Files:**
- Modify: `app/globals.css` (CSS variables), `app/layout.tsx`
- Create: `components/layout/Header.tsx`, `components/layout/Footer.tsx`, `app/page.tsx`

**Interfaces:**
- Produces: `<Header />`, `<Footer />` exports; tokens `--accent #3B3FA8`, `--paper #FAF8F4`, `--ink #17181D`, `--ink-muted`, `--surface`, `--line`, `--danger`.

- [ ] **Step 1:** Write token variables + Tailwind mapping in `globals.css` (light theme only; dark left as token swap — ADR-014).
- [ ] **Step 2:** Header = wordmark `vendra` + search field (non-functional) + cart icon; Footer = demo notice line ("Demo project — not a real store. Not affiliated with any retailer.") + one row of our own links.
- [ ] **Step 3:** Verify: `npm run dev`, open `/`, save screenshot to `docs/evidence/00-home-shell.png` — indigo accent, no orange/teal.
- [ ] **Step 4:** Commit `feat: vendra tokens, header, footer shell`

### Task 3: noindex + robots

**Files:**
- Modify: `app/layout.tsx` (metadata), `app/robots.ts`
- Create: `app/sitemap.ts`? **No** — skipped, noindex site (YAGNI).

- [ ] **Step 1:** In root metadata: `robots: { index: false, follow: false }` — applies to every page via layout.
- [ ] **Step 2:** `app/robots.ts` returns `Disallow: /` for all crawlers.
- [ ] **Step 3: Verify** (build, start, Node fetch — no curl/sleep):

```powershell
npm run build
if ($?) { $srv = Start-Process -FilePath "cmd" -ArgumentList "/c","npx","next start" -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 5
node -e "Promise.all([fetch('http://localhost:3000/').then(r=>r.text()),fetch('http://localhost:3000/robots.txt').then(r=>r.text())]).then(([h,r])=>{console.log('noindex:',/noindex/.test(h));console.log('robots:',/Disallow: \//.test(r))})"
$c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($c) { Stop-Process -Id $c.OwningProcess -Force } }
```
Expected: `noindex: true`, `robots: true`.

- [ ] **Step 4:** Commit `feat: noindex metadata + disallow-all robots`

### Task 4: Supabase connect (`@supabase/ssr`, guard file)

**Files:**
- Create: `.env.example`, `lib/supabase/client.ts`, `lib/supabase/server.ts`
- Create: **`proxy.ts`** (Next ≥16) **or** `middleware.ts` (Next 15.x — from Task 1 Step 3)

**Interfaces:**
- Produces: `createBrowserClient()` / `createServerClient()` from `@supabase/ssr` wrapping cookies; guard file exports `export default function proxy(request)` (or `middleware`) with a placeholder matcher only in this slice.

- [ ] **Step 1:** `.env.example` with **names only**: `NEXT_PUBLIC_SUPABASE_URL=`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=`, `SUPABASE_SERVICE_ROLE_KEY=`, `NEXT_PUBLIC_SITE_URL=` (plus `TEST_SUPABASE_*` names — architecture §10).
- [ ] **Step 2:** Implement `client.ts` (anon, browser) and `server.ts` (anon, cookies, `getUser()`-ready) with `@supabase/ssr`. `admin.ts` is **not** created yet (Slice 4).
- [ ] **Step 3:** Guard file: refresh session cookies; matcher excludes static assets. (Route guards themselves arrive in Slice 4.)
- [ ] **Step 4: Verify env is never printed:** `Select-String -Path lib,supabase*,app -Pattern "console.log\(process.env" -Recurse` → no matches.
- [ ] **Step 5:** Commit `feat: supabase ssr client/server + guard file`

### Task 5: First deploy via GitHub integration

- [ ] **Step 1:** `git init` if needed; commit all. Create a GitHub repo and push (`gh repo create <name> --private --source=. --push` or manual remote) — repo must **not** contain `.env*` (`.gitignore` from Task 1 proves it: `git ls-files | Select-String "\.env"` → only `.env.example`).
- [ ] **Step 2:** In the Vercel dashboard: **Import Project from GitHub** (integration, not CLI deploy). The **owner adds the env vars in the Vercel dashboard** (Settings → Environment Variables) — values are typed by the owner, never echoed into shells, logs or docs.
- [ ] **Step 3:** Push → production deploy runs; open the returned URL; run:
  `node -e "fetch(process.argv[1]+'/robots.txt').then(r=>r.text()).then(t=>console.log(/Disallow: \//.test(t)))" https://<prod-url>` → `true`.
  Screenshot home + robots into `docs/evidence/00-deploy.png`.
- [ ] **Step 4:** Record URL in `docs/progress.md` (Slice 0 → `DONE (verified: …)`).
- [ ] **Step 5:** Commit docs update.
