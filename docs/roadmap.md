# Vendra — Roadmap

Ordered slices, **strictly sequential** — each slice starts only after the previous one passes its
verification (no parallel lanes, no agent-pair assumption; one engineer executing plans inline
with superpowers:executing-plans). **MUST** = blocking; **NICE-TO-HAVE** = only after 1–8 pass.
Budget: 24 h.

| # | Slice | Priority | Est. | Depends on | Plan |
|---|---|---|---|---|---|
| 0 | **Foundation** — `.gitignore` first, Next.js + TS strict, vitest, Supabase via `@supabase/ssr`, guard file per installed Next (`proxy.ts`), tokens/palette, noindex + robots.txt, GitHub→Vercel deploy | **MUST** | 2.0 h | — | `plans/slice-0.md` |
| 1 | **Seeded catalogue** — `fetch-seed.ts` once, committed JSON, nav_groups + migrations, upsert-on-slug seed, rating baseline | **MUST** | 2.5 h | 0 | `plans/slice-1.md` |
| 2 | **Browse + PDP** — home, nav-group slug routes, product page (gallery, buy box, skeleton/empty/error) | **MUST** | 3.0 h | 1 | `plans/slice-2.md` |
| 3 | **Search, filters, sort** — URL state, `escapeLike`, header suggestions (`/api/suggest`), desktop rail, mobile bottom sheet | **MUST** | 2.5 h | 2 | `plans/slice-3.md` |
| 4 | **Auth + RLS** — sign up/in/out, `getUser()`, `proxy` guards, `?next=` validation, RLS tests | **MUST** | 2.0 h | 3 | `plans/slice-4.md` |
| 5 | **Cart** — DB cart + server stock check, optimistic updates, header badge, optional guest merge | **MUST** | 1.5 h | 4 | `plans/slice-5.md` |
| 6 | **Checkout** — address, mock payment (expiry, no card storage), `place_order` (reads cart, service-role-only, idempotent) | **MUST** | 3.0 h | 5 | `plans/slice-6.md` |
| 7 | **Orders** — list, derived-status timeline, idempotent cancel + refund | **MUST** | 1.5 h | 6 | `plans/slice-7.md` |
| 8 | **Reviews** — server-derived eligible order, trigger rollup incl. seed baseline | **MUST** | 1.5 h | 7 | `plans/slice-8.md` |
| 9 | **Stripe test mode** — replace mock payment; server re-reads PaymentIntent before order | MUST (conditional) | 2.0 h | 6–8 stable | deferred — plan written when 1–8 pass; **outside the 24 h budget** |
| 10 | **Polish + demo prep** — responsive pass, loading/error/empty audit, README (Amazon vs Vendra table), incognito check, walkthrough prep | **MUST** | 1.5 h | 8 | `plans/slice-10.md` |
| — | Wishlist, browsing history, Today's Deals, customer service, seller side, dark theme | NICE-TO-HAVE | — | after 10 | not planned |

**Budget math (every hour allocated):**

- **Total MUST (0–8): ≈ 19.5 h** — raised from ≈18 h (Slice 0, 1 and 6 estimates bumped for the
  added hardening: guard file per Next version, `@supabase/ssr`, vitest, GitHub deploy flow,
  upsert seeding + test project, payment expiry + pricing rules; remaining hardening in Slices
  5/7/8 is funded from the buffer).
- **Slice 10: ≈ 1.5 h** (new).
- **Buffer: ≈ 4.5 h** — raised from ≈4 h; covers Slice 10 (1.5 h) plus ≈3 h of fixes, deploy
  verification and walkthrough recording.
- 19.5 + 4.5 = **24 h** ✓.

## Milestones

- **M1 (≈4.5 h):** Slice 0+1 — live on Vercel with a seeded catalogue.
- **M2 (≈10.0 h):** Slice 2+3 — anyone can browse, search and filter.
- **M3 (≈16.5 h):** Slice 4+5+6 — a signed-in buyer can check out.
- **M4 (≈19.5 h):** Slice 7+8 — orders, cancel, reviews: the demo journey is complete.
- **M5:** Slice 10 (polish + demo prep) out of the buffer; Slice 9 only if time remains beyond it.

## Risk notes

- Supabase free project can **pause after inactivity** → unpause before demo day (ADR-009).
- Email confirmation must be **disabled in the dashboard** by hand (ADR-007) — Slice 4 blocked
  until done.
- Images ride on `cdn.dummyjson.com` — fallback tile must exist before Slice 2 review (ADR-006).
- Sequential ordering is deliberate (owner instruction): if a slice slips, cut from the buffer by
  timeboxing, never by skipping verification steps.
