# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## This repo's Next.js version has breaking changes vs. your training data

Next.js 16.4.5 here differs from what you were trained on. `AGENTS.md` carries
this same warning, but once this `CLAUDE.md` exists Claude Code stops reading
`AGENTS.md` by default — so the warning is repeated here rather than silently
dropped. **Read `node_modules/next/dist/docs/` before using any Next.js API
you're not certain is unchanged**, especially routing, caching, and Route
Handler conventions.

## Commands

- `pnpm dev` — start the dev server (`http://localhost:3000`).
- `pnpm build` / `pnpm start` — production build / serve.
- `pnpm typecheck` — `tsc --noEmit`.
- `pnpm lint` — ESLint.
- `pnpm test` — all tests (`vitest run src`).
- Single test file: `pnpm exec vitest run <path>` (e.g. `pnpm exec vitest run src/features/payments/paypal.test.ts`).
- Single test by name: add `-t "<test name>"` to the above.
- First run needs `.env.local` (copy `.env.example`): `OPENAI_API_KEY` is required for the planner/booking agents; `DUFFEL_API_KEY` for real flight search (its absence 503s, doesn't fall back to fake data); `PAYPAL_CLIENT_ID`/`SECRET` and `PAYPAL_WEBHOOK_ID` for checkout/refund/webhooks; Supabase vars for auth/persistence.

## Architecture

**What's real vs. simulated — this is the load-bearing fact of the whole app.** Flight offers are real (Duffel test-mode API, live at request time). Hotels and activities are synthetic fixtures (`src/features/suppliers/synthetic.ts`) — no instant self-serve real-data option exists for either. PayPal payment (`src/features/payments/paypal.ts`) is real against PayPal's sandbox: it pays for *Tripweave's own itinerary plan*, not a travel booking. Actually purchasing from the supplier after payment (`simulateBooking` in `src/features/suppliers/booking.ts`) is simulated — gated on partner access (Duffel/Booking.com) not reachable yet. Don't blur these lines in new code or comments; see `docs/adr/0001-trip-order-funds-tripweave-not-suppliers.md` and `docs/adr/0002-multi-payee-orders-pay-suppliers-directly.md` for why, and `GLOSSARY.md` for the vocabulary ("Itinerary Plan", "Trip Order", "Supplier Booking", "Onboarded Supplier") the code and comments use — match it rather than inventing synonyms.

**Planner flow** (`POST /api/plan` → `src/features/agent/`): a LangGraph `createReactAgent` calls three search tools plus `build_itinerary` (`src/features/agent/tools.ts`, backed by `src/features/planner/planner.ts`). The model only *selects* which offers go into the plan — `build_itinerary` deterministically computes totals and checks budget/trip-window/schedule conflicts, and the plan route recomputes from the agent's chosen offer ids before responding, so the model's own output never sets a price or a feasibility verdict.

**Payment → booking flow** (`POST /api/payments/capture`, `src/app/api/payments/capture/route.ts`): one capture call splits into purchase units per `planPurchaseUnits` (an Onboarded Supplier's offer gets its own unit/payee; everything else sums into one Tripweave bundle unit). The route then runs `streamBookingAgent` (NDJSON stream) only over the bundle offers, and `reconcileBookings` (`src/features/suppliers/booking.ts`) enforces the invariant that booked + refunded amounts reconstruct the captured bundle total exactly, throwing rather than returning a silently wrong number. Reading just `paypal.ts` or just `booking.ts` won't show this — the split happens in the route.

**Money type**: amounts are `MinorUnits` (branded, via `minorUnits()` in `src/features/planner/types.ts`), not bare numbers, everywhere an offer's cost flows through the planner/payment path. New code touching offer costs should go through that constructor, not a raw `number`.

**API routes**: every route under `src/app/api/` validates its body with a zod schema inside a try/catch before doing anything else, returning a 4xx on parse failure — follow this shape for new routes rather than inventing a different validation style. Routes needing a signed-in user call `authedUser()` (`src/lib/supabase/authedUser.ts`); routes that must write on the traveler's behalf with no session to scope to (e.g. the capture route's order-receipt insert) use `createAdminClient()` (`src/lib/supabase/admin.ts`), which bypasses Supabase RLS on purpose — don't reach for it outside that specific case.

**Supabase schema** (`supabase/migrations/0001_init.sql`): every table is owned by `user_id` and RLS-locked to that owner; there is no separate migration tool wired up, so schema changes mean hand-editing/adding a migration file and applying it directly against the project's Postgres instance.

<!-- claude-reflect: learned rules (saved from the band; edit freely) -->
## Learned rules
- Deploy and configure this project on Heroku only; do not reference Render for env vars or deployment steps.
<!-- end claude-reflect -->
