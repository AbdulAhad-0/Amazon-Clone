# Vendra — Progress

Status values: `NOT STARTED` · `IN PROGRESS` · `BLOCKED` · `DONE (verified: <command run>)`.
**Never mark DONE without citing the command whose output was seen** (brief rule).

## Slices

| # | Slice | Status | Started | Verified by |
|---|---|---|---|---|
| 0 | Foundation | **DONE (verified:** node poll → `noindex:true robots:true vendra:true` on `https://amazon-clone-eight-beryl.vercel.app/`; Playwright → meta `noindex, nofollow`, robots `User-Agent: * / Disallow: /`, paper/indigo demo notice; evidence `docs/evidence/00-deploy*.png` + `00-deploy-checks.txt`**)** | 2026-10-03 | 2026-10-03 |
| 1 | Seeded catalogue | NOT STARTED | — | — |
| 2 | Browse + PDP | NOT STARTED | — | — |
| 3 | Search, filters, sort | NOT STARTED | — | — |
| 4 | Auth + RLS | NOT STARTED | — | — |
| 5 | Cart | NOT STARTED | — | — |
| 6 | Checkout (mock payment) | NOT STARTED | — | — |
| 7 | Orders + cancel | NOT STARTED | — | — |
| 8 | Reviews | NOT STARTED | — | — |
| 9 | Stripe test mode | NOT STARTED (deferred until 1–8 pass) | — | — |
| 10 | Polish + demo prep | NOT STARTED | — | — |

## Docs

| Doc | Status |
|---|---|
| `docs/requirements.md` (summary) | DONE |
| `docs/spec.md` | **DRAFT** — owner approved docs 2026-10-03; flip spec Status line DRAFT→APPROVED (pending, one-line) |
| `docs/architecture.md` | DONE (awaiting owner review) |
| `docs/roadmap.md` | DONE (awaiting owner review) |
| `docs/decisions.md` (ADR-001..020) | DONE (awaiting owner review) |
| `docs/progress.md` | DONE |
| `docs/plans/slice-0..8.md`, `slice-10.md` | DONE (awaiting owner review) |

Evidence convention: screenshots + verification output land in **`docs/evidence/`** (ADR-020).

## Open items

- **OPEN QUESTION** pain points: ~~owner to add own entries to `spec.md` §7.1~~ — owner's pain points
  landed in §7.1 (labelled CONFIRMED/REPORTED/ASSUMPTION), sources in `docs/research-notes.md`.
- **OPEN QUESTION** currency USD assumed — confirm before Slice 1.
- ~~Manual step: disable Supabase email confirmation (ADR-007)~~ — DONE (owner, 2026-10-03).
- Manual step: confirm Supabase project not paused before demo (ADR-009).
- Supabase dashboard key names → repo env names: "publishable" (anon) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
  "secret" (service_role) → `SUPABASE_SERVICE_ROLE_KEY` (server-only, ADR-008).
- Production URL: `https://amazon-clone-eight-beryl.vercel.app/` (Vercel Git integration, auto-build on push).
- Note: `with_server.py` leaves orphaned `next dev` child processes on port 3000 — kill leftovers
  manually before re-running local browser checks (Slice 0 lesson).
