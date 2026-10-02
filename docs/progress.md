# Vendra — Progress

Status values: `NOT STARTED` · `IN PROGRESS` · `BLOCKED` · `DONE (verified: <command run>)`.
**Never mark DONE without citing the command whose output was seen** (brief rule).

## Slices

| # | Slice | Status | Started | Verified by |
|---|---|---|---|---|
| 0 | Foundation | NOT STARTED | — | — |
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
| `docs/spec.md` | **DRAFT** — awaiting owner approval (spec rule, 2026-10-03) |
| `docs/architecture.md` | DONE (awaiting owner review) |
| `docs/roadmap.md` | DONE (awaiting owner review) |
| `docs/decisions.md` (ADR-001..020) | DONE (awaiting owner review) |
| `docs/progress.md` | DONE |
| `docs/plans/slice-0..8.md`, `slice-10.md` | DONE (awaiting owner review) |

Evidence convention: screenshots + verification output land in **`docs/evidence/`** (ADR-020).

## Open items

- **OPEN QUESTION** pain points: owner to add own entries to `spec.md` §7.1.
- **OPEN QUESTION** currency USD assumed — confirm before Slice 1.
- Manual step: disable Supabase email confirmation (ADR-007) — owner, dashboard.
- Manual step: confirm Supabase project not paused before demo (ADR-009).
