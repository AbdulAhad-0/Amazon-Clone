# Requirements — Assignment Summary

> **THIS IS A SUMMARY, NOT VERBATIM.** Source: the planning prompt in the session of 2026-10-03.
> The original brief file (`docs/requirements.md`) did not exist in the repo; this file records
> the summary the planner worked from. If the original brief differs, the original wins.

## Assignment

- Rebuild an Amazon-like storefront in **24 hours**.
- **"Make it your own"** — Amazon is a reference, not a blueprint. A pixel copy scores poorly.
- Judged on: (1) **speed** = how much working product ships, (2) **product judgement** = what is
  built first and what is left out, (3) **UX/UI**.

## Deliverables

1. Live link (deployed).
2. Public repo including `.agent-logs/`.
   *(Convention note, owner decision 2026-10-03: screenshots and verification evidence are stored
   in `docs/evidence/`, **never** `.agent-logs/` — ADR-020. The brief's `.agent-logs/` line stands
   for any agent session logs the harness writes; we do not put screenshots there.)*
3. 5-minute walkthrough video, camera on.

## Fixed stack

Next.js (App Router) + TypeScript strict · Supabase (Auth, Postgres + Row Level Security, Storage) ·
Tailwind + shadcn/ui · Deployed on Vercel · No separate Express server.

## Hard rules

- Own brand name, logo, palette. **Never** use the name Amazon, its logo, orange/smile branding, or
  its copy in code or UI. Footer demo notice. `noindex` meta on every page. `robots.txt` disallows all.
- All money in **integer cents**, calculated **on the server only**. An order is created only after
  the server verifies payment; order creation, stock decrement and cart cleanup happen in **one transaction**.
- Never read, print or log any `.env` file or secret. Use `.env.example` placeholders only.
- Never claim anything works or passed unless the command was actually run and its output seen.
- Mark every assumption as `ASSUMPTION` and every unknown as `OPEN QUESTION`.

## Scope (MUST, in order)

0. Foundation — Next.js setup, Supabase connect, first Vercel deploy, `.env.example`, noindex, robots.txt
1. Seeded catalogue — 500–2000 products, ≥8 categories, free/licensed source *(revised: see spec.md)*
2. Browse + product page
3. Search, filters, sort (filters in URL; bottom sheet on phones)
4. Auth (sign up / in / out) with RLS and server-side ownership checks
5. Cart — persistent, optimistic updates
6. Checkout — fake payment step, one transaction
7. Orders — list, details, status timeline, cancel before shipping with stock restore
8. Reviews — buyer-only, server checks a real order, one review per product
9. Stripe test mode replacing the fake payment (only after 1–8 work)

**NICE-TO-HAVE:** wishlist, browsing history, Today's Deals, customer service page, seller side, dark theme.

**Plan for:** light/dark readiness, loading/empty/error states, mobile-first layout.
