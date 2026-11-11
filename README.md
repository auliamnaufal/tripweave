# Tripweave

Tripweave is a deal-hunting travel agent with one checkout. It searches every platform Tripweave partners with at once (airlines, hotel networks, OTAs, local operators), finds the best deal for each part of the trip, and wraps it all into **one PayPal approval**. Tripweave is the gateway: the traveller pays once, and Tripweave pays and books each platform behind the scenes.

Partnerships, not scraping: Tripweave only reaches platforms through their own partner or affiliate APIs. A platform it hasn't partnered with is never crawled or driven by a bot.

**What's real in this proof of concept, and what's simulated**

| | |
|---|---|
| Real | Duffel airline fares (test mode) and repricing · LiteAPI hotel rates, prebook and **sandbox bookings** · Aviasales market fares via **Travelpayouts** (the demo's live partner integration, with affiliate links) · PayPal sandbox order, capture, refunds and webhooks · retailer products for the gear kit via **Channel3** · the agent's tool calls |
| Simulated | OTA partners **Nusantara Trips** and **SkyBazaar**, standing in for B2B partners such as Traveloka Partners Network or tiket.com B2B. They resell the same real Duffel and LiteAPI inventory at their own prices and terms, so the comparison is product-for-product. Their bookings and airline ticketing return `SIM-…` references |

Deterministic code, not the model, owns every price, total and booking.

### Ask in your own words

Type the trip the way you'd say it ("Japan, 2 people: Tokyo day 1, Osaka day 2, Mount Fuji on day 3"). An intake agent (`/api/intake`) reads it into a route of stops with nights, day-by-day wishes, dates, party and budget; code fills the gaps from the traveller's defaults and validates it. Multi-city trips get a flight per leg, a hotel per stop and the requested day trips as bookable activities. Any city works, not only the seven catalog destinations.

- **Swap instantly.** Every flight leg and stay shows the other options from the same search, with platform and price difference. Picking one (or "make the hotel cheaper") rebuilds the plan from the saved catalog in about a second (`/api/plan/swap`), no new search.
- **Checkout recovers.** If a supplier no longer confirms an item (a sandbox rate moved or sold out), checkout tries the next option for that leg or stay and asks the traveller to approve the new total.
- **E-tickets.** After booking, `/tickets` shows a boarding pass, hotel voucher or activity ticket per item with a QR code (order and booking reference only) and the traveller names from checkout.

### The deal hunt

1. `searchCatalog` queries every platform in parallel and keeps each product at its cheapest bookable platform.
2. The agent searches, calls `compare_platforms` (what each platform charges for the exact products it's considering, with terms), calls `check_market` (Aviasales fares on the same route and the cheapest day within a week), then `build_itinerary` until the selection fits.
3. The server computes the deal summary from the search itself, not from the model: platforms searched, offers compared, what each item saved against the priciest platform, and date tips. `/trip` shows it in the "Deal hunt" panel, with simulated partners labelled.

### Pack for it (Channel3)

Under a live plan, "Find gear" (`POST /api/gear`) suggests a few things worth buying for *this* trip. The model only names what to look for (a rain jacket for Tokyo in June, boots for a Mount Fuji day); code splits what's left under the budget into a per-item cap, and [Channel3](https://trychannel3.com) searches real US retailers for in-stock products at or under it. Each product links to its retailer (`rel="sponsored"`, with the commission disclosure). Gear is bought from the retailer, never added to the Trip Order or its PayPal payment. Off while `CHANNEL3_API_KEY` is empty.

Each pick has **More like this** (`POST /api/gear/similar`): Channel3's `/v1/similar` finds the closest products to it, held to the same per-item cap. The cap is read from the server's cached kit for that quote (or, if the kit has expired, the smallest cap a kit could have), never from the browser, so alternatives can't push gear past the budget.

### The whole trip at a glance (Bryntum Scheduler)

`/trip` opens with a [Bryntum Scheduler](https://bryntum.com/products/scheduler/) timeline: one row each for flights, stay and things to do, one bar per offer at its local time, the travel dates shaded. Bars only show what the planner already decided: a schedule conflict or an offer outside the trip window (from `build_itinerary`'s violations) is striped red, with what it clashes with in the tooltip. Bars don't drag, because times come from the suppliers.

- Before payment, clicking a bar opens the swap panel for that kind (the same instant edits as the Change buttons).
- After payment, each bar shows what its booking became, read from what capture stored (`/api/tickets`, the same source as the e-tickets): ✓ booked with its reference, or ↺ refunded to the traveller's PayPal (struck through, with the supplier's reason). The heading says how much came back.

### Trip spend (AG Studio)

`/insights` is an [AG Studio](https://www.ag-grid.com/studio/) dashboard of every Trip Order the traveller paid with PayPal, built only from `plan_quotes` + `bookings` as stored at capture: paid / booked / refunded KPIs, spend by kind and by platform and outcome, every line with its booking reference, and a custom **PayPal money trail** widget: one bar per Trip Order, split into booked, pending, failed and refunded, so a refund reads as part of the same payment.

In edit mode, Studio's AI agents work through a Tripweave adapter (`src/features/insights/ai/responsesAdapter.ts`) that speaks the OpenAI Responses API via `POST /api/ai/responses`, a signed-in-only proxy that holds the key, pins `OPENAI_MODEL` and caps each turn. The team is Studio's built-in agents plus a custom **Trip Order auditor**: the built-in lead can hand off to it, it reads the orders through a `reconcile_trip_orders` tool whose numbers are computed in code (paid = booked + refunded + pending, to the cent), and it hands dashboard edits back to the built-in page and widget agents. Without `AG_STUDIO_LICENSE_KEY` Studio runs as a trial with a watermark.

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

| Platform | Kind | Type | Status |
|---|---|---|---|
| Duffel | flights | bookable | Real search and reprice (test mode). Ticketing simulated |
| LiteAPI | hotels | bookable | Real rates; reprice via prebook; real sandbox booking (`clientReference` = idempotency key) |
| Aviasales (Travelpayouts) | flights | deeplink | Real cached market fares with affiliate links; benchmark and date tips |
| Nusantara Trips, SkyBazaar | flights, hotels, activities | bookable | Simulated OTA partners over the real inventory above |
| Local operators | activities (and fallback stays) | bookable | Sample catalog for 7 destinations |

All Duffel, LiteAPI and sample searches are memoized per brief, so a source is called once per plan however many partners resell it.

Adding one: write `src/features/suppliers/<name>.ts`, add a `contract(...)` line with recorded fixtures in `adapter.contract.test.ts`, register it in `defaultRegistryConfig()`. Nothing else changes. See `docs/backend-integration-guide.md`.

### PayPal

Orders v2, following PayPal's current guide:

- `intent: CAPTURE`, with line items and `amount.breakdown`.
- `payment_source.paypal.experience_context` with `user_action: PAY_NOW`, `shipping_preference: NO_SHIPPING`, `return_url` / `cancel_url` (the deprecated `application_context` isn't used). The buyer link is `rel: "payer-action"`.
- `custom_id` = the quote id on every purchase unit, so webhook events map back to their quote.
- `INSTRUMENT_DECLINED` on capture sends the buyer back to PayPal; nothing was captured.
- Onboarded Suppliers (a hotel or activity vendor that shared its PayPal email) get their own purchase unit and `payee` on the same order. Flights never do.
- Webhooks: `POST /api/webhooks/paypal` verifies each delivery with PayPal (`verify-webhook-signature`), records it once by event id, and acts on `PAYMENT.CAPTURE.*`.
- Everything above goes through PayPal's APIMatic-generated Server SDK (`@paypal/paypal-server-sdk`, pinned). Webhook verification, which the SDK has no operation for, still takes its OAuth token from the SDK's `ClientCredentialsAuthManager`, and the client refreshes tokens 60 s early (`oAuthClockSkew`) because the SDK never refreshes on a 401. Both changes came from the [APIMatic Context Plugin for PayPal](https://github.com/paypaldev/server-sdk-context-plugin-preview), whose TypeScript skills were used to review this integration against the SDK's own source.

## Run locally

1. Node.js 22+ and pnpm (`corepack enable`).
2. `pnpm install`
3. Copy `.env.example` to `.env.local` and fill it in:
   - `OPENAI_API_KEY`
   - `DUFFEL_API_KEY`: free test-mode account at [duffel.com](https://duffel.com)
   - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`: a sandbox REST app at [developer.paypal.com](https://developer.paypal.com)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
   - Optional: `LITEAPI_KEY`, `TRAVELPAYOUTS_TOKEN`/`TRAVELPAYOUTS_MARKER`, `CHANNEL3_API_KEY` (each feature is off while its key is empty), `AG_STUDIO_LICENSE_KEY` (Trip spend runs as a watermarked trial without it)
4. Apply `supabase/migrations/*.sql` in order (Supabase SQL editor, or `supabase db push`).
5. `pnpm dev`, then open `http://localhost:3000`.

To pay in sandbox, log in on PayPal's page with a **sandbox personal** account from developer.paypal.com → Testing tools → Sandbox accounts.

### Demo mode

`DEMO_MODE=true` makes the earliest activity fail to book every time, so the partial refund shows reliably: the row turns "refunded" in `/booked` and the refund appears on the sandbox capture. It also lets `/lab` route one non-flight offer to a hand-entered sandbox payee. Keep it `false` anywhere else.

## Deploy (Render)

`render.yaml` is a Render Blueprint: one Node 22 web service that builds with pnpm (via Corepack, pinned by `packageManager`) and runs `next start` on Render's `PORT`.

1. In Render: **New → Blueprint**, pick this repo. Render asks once for every `sync: false` value; fill them from `.env.example`.
2. When the service is up, set `APP_BASE_URL` to its URL (e.g. `https://tripweave.onrender.com`). PayPal's `return_url` / `cancel_url` are built from it.
3. In the PayPal sandbox app → **Webhooks**, add `<APP_BASE_URL>/api/webhooks/paypal` with the events `PAYMENT.CAPTURE.COMPLETED`, `PENDING`, `DENIED`, `DECLINED`, `REVERSED` and `REFUNDED`, then put the webhook id in `PAYPAL_WEBHOOK_ID`.
4. Optional: `NEXT_PUBLIC_PAYPAL_SANDBOX_BUYER_EMAIL` / `_PASSWORD` show a sandbox buyer login at checkout. They are compiled into the page, so redeploy after setting them.

The free plan sleeps after 15 idle minutes and takes about a minute to wake; `plan: starter` avoids that for a judged demo.

## Limits

- Bookings are simulated (`SIM-…` references). Real ticketing needs Duffel Orders with a funded balance and real passenger details. Real hotel/activity booking needs an approved supplier API.
- Traveller identity is fictional; no passport data is collected.
- Sandbox only. `PAYPAL_MODE=live` exists but isn't something to switch on for this project.

## Checks

- `pnpm test`: planner, quotes, suppliers (adapter contract, registry, comparison, booking), routes, PayPal, webhooks
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
