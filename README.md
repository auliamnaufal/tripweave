# Tripweave

Tripweave plans a holiday within a budget and lets the traveller pay for all of it with **one PayPal approval**. An AI agent picks flights, a stay and activities from offers that real suppliers priced. Deterministic code, not the model, owns every price, total and booking.

## How it works

```
brief ──► /api/plan ──► supplier registry (Duffel + others, in parallel)
                         │  one catalog, best bookable deal per product
                         ▼
                   planner agent picks offer ids ──► buildItinerary (deterministic)
                         │
                         ▼
                   plan_quotes row  ◄── the only thing checkout can pay
                         │
/api/payments/order ─────┤ reprice every offer with its supplier → PayPal order
                         │ (payment_source.paypal.experience_context, PayPal-Request-Id)
   buyer approves on PayPal ──► /checkout/return ──► /booked
                         │
/api/payments/capture ───┤ capture once → book each item → refund what failed
                         ▼
                   bookings rows (one per paid item)  ◄── /api/webhooks/paypal reconciles
```

- **One search per plan.** `searchCatalog` queries every configured supplier in parallel (with a timeout each), validates every offer against the adapter contract, and compares the same product across platforms. The agent and the server use that same catalog, so ids and prices can't drift.
- **The model never sets a number.** It returns offer ids. `buildItinerary` computes totals, budget fit, trip window and schedule conflicts.
- **The browser never sets a price.** The priced plan is saved as a plan quote. Order creation takes only `quoteId`; capture takes only the PayPal order id.
- **Prices are re-checked before payment.** If a supplier's price moved, a new quote is created and the traveller approves the new total. If an offer is gone, they plan again. Nothing is charged at an unconfirmed price.
- **Every money movement is idempotent.** Order, capture and each refund send a `PayPal-Request-Id` derived from the quote. Each booking gets an idempotency key too.
- **Capture is locked and durable.** Only one capture per quote can run. Each paid item's outcome is stored in `bookings`, and a reload replays it instead of charging or booking again. Booking keeps running if the browser disconnects.
- **Only cleared money is spent.** Booking starts only when PayPal's capture itself is `COMPLETED`. A `PENDING` capture waits for the webhook.
- **Bookings are recorded from supplier answers.** `runBookings` books each item through its own adapter (flights first). One failure doesn't stop the rest, and the failed item's share is refunded.

### Suppliers

Every supplier is a `SupplierAdapter` (`src/features/suppliers/adapter.ts`) with `search`, `reprice` and `book`, and is either:

- **bookable**: Tripweave can reprice and book it, so it may be paid through PayPal; or
- **deeplink**: price information only (affiliate or metasearch). Shown as "cheaper on X" with its link, never charged.

| Supplier | Kind | Type | Status |
|---|---|---|---|
| Duffel | flights | bookable | Real search and reprice (test mode). Ticketing still simulated |
| Synthetic catalog | hotels, activities | bookable | Sample data for 7 destinations, until a real API is connected |

Adding one: write `src/features/suppliers/<name>.ts`, add a `contract(...)` line with recorded fixtures in `adapter.contract.test.ts`, register it in `defaultRegistryConfig()`. Nothing else changes. See `docs/backend-integration-guide.md`.

### PayPal

Orders v2, following PayPal's current guide:

- `intent: CAPTURE`, with line items and `amount.breakdown`.
- `payment_source.paypal.experience_context` with `user_action: PAY_NOW`, `shipping_preference: NO_SHIPPING`, `return_url` / `cancel_url` (the deprecated `application_context` isn't used). The buyer link is `rel: "payer-action"`.
- `custom_id` = the quote id on every purchase unit, so webhook events map back to their quote.
- `INSTRUMENT_DECLINED` on capture sends the buyer back to PayPal; nothing was captured.
- Onboarded Suppliers (a hotel or activity vendor that shared its PayPal email) get their own purchase unit and `payee` on the same order. Flights never do.
- Webhooks: `POST /api/webhooks/paypal` verifies each delivery with PayPal (`verify-webhook-signature`), records it once by event id, and acts on `PAYMENT.CAPTURE.*`.

## Run locally

1. Node.js 22+ and pnpm (`corepack enable`).
2. `pnpm install`
3. Copy `.env.example` to `.env.local` and fill it in:
   - `OPENAI_API_KEY`
   - `DUFFEL_API_KEY`: free test-mode account at [duffel.com](https://duffel.com)
   - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`: a sandbox REST app at [developer.paypal.com](https://developer.paypal.com)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
4. Apply `supabase/migrations/*.sql` in order (Supabase SQL editor, or `supabase db push`).
5. `pnpm dev`, then open `http://localhost:3000`.

To pay in sandbox, log in on PayPal's page with a **sandbox personal** account from developer.paypal.com → Testing tools → Sandbox accounts.

### Demo mode

`DEMO_MODE=true` makes the earliest activity fail to book every time, so the partial refund shows reliably: the row turns "refunded" in `/booked` and the refund appears on the sandbox capture. It also lets `/lab` route one non-flight offer to a hand-entered sandbox payee. Keep it `false` anywhere else.

## Deploy (Render)

`render.yaml` is a Render Blueprint. In Render: **New → Blueprint**, pick this repo, then fill the env values it asks for. Set `APP_BASE_URL` to the service URL, then add `<APP_BASE_URL>/api/webhooks/paypal` as a webhook in the PayPal app (events `PAYMENT.CAPTURE.*`) and put its id in `PAYPAL_WEBHOOK_ID`.

## Limits

- Bookings are simulated (`SIM-…` references). Real ticketing needs Duffel Orders with a funded balance and real passenger details. Real hotel/activity booking needs an approved supplier API.
- Traveller identity is fictional; no passport data is collected.
- Sandbox only. `PAYPAL_MODE=live` exists but isn't something to switch on for this project.

## Checks

- `pnpm test`: planner, quotes, suppliers (adapter contract, registry, comparison, booking), routes, PayPal, webhooks
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
