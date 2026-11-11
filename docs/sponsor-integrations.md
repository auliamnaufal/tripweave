# Sponsor integrations: what to show

This is for whoever records the demo video and writes the Devpost submission. For each sponsor it covers what Tripweave does with them, where it is in the app, what the sponsor's judges asked for, and the shots that prove it. The code-level details are in the README; this page is about showing them.

## Before recording

- **Env (local and Heroku config vars):** `OPENAI_API_KEY`, `DUFFEL_API_KEY`, the PayPal sandbox keys and `PAYPAL_WEBHOOK_ID`, the Supabase keys, `CHANNEL3_API_KEY`, `AG_STUDIO_LICENSE_KEY`.
  - Set `DEMO_MODE=true` for the recording only. The earliest activity then always fails to book and gets refunded, so the refund and the rebooking agent appear on cue. Set it back to `false` afterwards.
- **Account:** sign in with the demo account ("Continue with demo account" on the sign-in page) so `/insights` already has a paid Trip Order.
- **Payment:** pay with a PayPal **sandbox personal** account (developer.paypal.com → Testing tools → Sandbox accounts). It is never a real login.
- **Channel3 credits:** redeem the promo code `PAYPAL-HACKATHON-2026` in the Channel3 dashboard (20,000 credits), so gear search can't run dry during judging.
- **Bryntum:** the app uses Bryntum's trial package, as the sponsor page says to. Ask the Bryntum team on the PayPal Discord whether the trial stays valid through judging (Dec 1–15, 2026). An expired trial covers the timeline with a "Trial expired" notice.

## Bryntum: the trip on a Scheduler, with an agent working on it

**The judges asked for** "the cleanest timeline, the smartest resource booking, or an agent that drives the schedule itself". One of their own ideas is an agent that "watches PayPal payment events and automatically moves or flags … bookings … when a payment … gets refunded".

**What Tripweave does** (`/trip`, the "The whole trip at a glance" timeline):

1. **Before payment:**
   - One row each for Flights, Stay and Things to do, with every bar at its local time and the travel dates shaded.
   - A schedule clash or a booking outside the dates is striped red, and the tooltip says what it clashes with.
   - Clicking a bar opens the swap panel for that kind.
2. **After the single PayPal payment:**
   - Each bar shows what its booking became: ✓ booked with its reference, or ↺ refunded to PayPal (struck through, with the supplier's reason).
   - The heading says how much came back.
3. **Rebooking agent:**
   - A refunded activity leaves a hole in the trip. **Find a replacement** sends an agent to look through the same search for something that fits that slot: clear of everything still booked, inside the dates, and within what was refunded.
   - Its picks appear on the Scheduler as dashed ghost bars next to the refunded one. Each has the agent's reason in the tooltip and in a card under the timeline.
   - These are suggestions only: nothing is booked or charged.

**Shots:**

- Hover a red clash bar to show the tooltip.
- Click a bar to show the swap panel opening.
- After paying in `DEMO_MODE`, show the refunded bar and the "came back to your PayPal" heading.
- Click **Find a replacement**, then hover the dashed suggestion to show the agent's reason.

**Say:** the agent only chooses. Code decides what fits the slot and checks the agent's picks again, so it can't invent an activity, a price or a time.

## AG Grid (AG Studio): Trip spend dashboard with a custom agent

**The judges asked for** "custom widgets, theming, and layout tools, not just AG Grid or AG Charts on their own". They also want to see the Studio Agent Framework used: "a custom agent talking to Studio's built-in agents, or a swapped-in harness". Tripweave does both.

**What Tripweave does** (`/insights`, "Trip spend" in the sidebar):

- **The dashboard:** every Trip Order the traveller paid with PayPal, built from what capture stored. It shows paid / booked / refunded KPIs, spend by kind and by platform, and a grid of every line with its booking reference.
- **Custom widget, PayPal money trail:** one bar per Trip Order, split into booked, pending, failed and refunded. A refund reads as part of the same payment.
- **Theming and layout:** the Studio theme uses Tripweave's own colour tokens. The layout is a hand-built report (KPIs, money trail, charts, grid).
- **Custom agent, Trip Order auditor:** Studio's built-in lead agent hands off to it. The auditor reconciles orders with a `reconcile_trip_orders` tool whose numbers are computed in code (paid = booked + refunded + pending, to the cent). It then hands dashboard edits back to Studio's built-in page and widget agents.
- **Swapped-in harness:** all of Studio's agents run through Tripweave's own adapter to the OpenAI Responses API, behind a signed-in-only proxy that holds the key.

**Shots:**

- Open `/insights` and scroll past the KPIs to the money trail.
- Switch to **Edit & ask AI** and use the prompt starter "Where did my money go?". Show the hand-off to the auditor and its reconciliation.
- Ask it to add a widget, and show the built-in agents building it.

## Channel3: gear for this exact trip, within the budget

**The judges asked for** Channel3 to be "a meaningful part of the product experience — search, product enrichment or recommendations". Projects that only mention it don't qualify.

**What Tripweave does** (`/trip`, the **Find gear** panel under the plan):

- **Gear kit:** the model names what this trip needs, for example a warm jacket for Tokyo in December or boots for a Mount Fuji day. Code splits what's left of the budget into a per-item cap, and Channel3 searches real US retailers for in-stock products under it.
- **More like this:** each pick has a **More like this** button. Channel3's `/v1/similar` returns close alternatives, held to the same cap.
- **Links and disclosure:** products link out to the retailer, with the commission disclosure. Gear is never added to the PayPal Trip Order.

**Shots:**

- Click **Find gear** and show the real products with prices under the cap.
- Click **More like this** on one pick.

## APIMatic: the PayPal integration built with the Context Plugin

**The judges asked for** projects that used the APIMatic Context Plugin for PayPal to build their PayPal integration. This one happens in the coding agent, not in the app, so it has to be told: in the video and in the Devpost text.

**What happened:**

- The Context Plugin for PayPal (`paypal` plugin, TypeScript skills) was installed in Claude Code.
- Claude Code used it to review Tripweave's PayPal integration against the APIMatic-generated PayPal Server SDK (`@paypal/paypal-server-sdk`).

**What that review confirmed was already right:**

- **Timeouts:** every PayPal request has a 30-second timeout (the SDK's default is none).
- **Typed errors:** errors are read through the SDK's typed `ApiError`, and `INSTRUMENT_DECLINED` sends the buyer back to PayPal.
- **Safe retries:** every POST (order, capture, refund) carries a `PayPal-Request-Id`, so a retry can't double-charge or double-refund.

**What it changed (commit "Take the webhook token from the PayPal SDK, refresh tokens early", `src/features/payments/paypal.ts`):**

- **Webhook token from the SDK:** webhook signature verification, which the SDK has no operation for, now takes its OAuth token from the SDK's own `ClientCredentialsAuthManager` instead of a hand-rolled token request.
- **Early token refresh:** the client now refreshes tokens 60 seconds before they expire (`oAuthClockSkew`). The SDK never refreshes on a 401, so a token expiring mid-request would otherwise fail.

**Shots:** a short screen capture of Claude Code with the `paypal` plugin's skills loaded, then the diff of that commit. Close with a successful sandbox payment in the app.

**After submitting:** fill in the APIMatic free-subscription claim form linked on the sponsor page.

## Real vs. simulated (say it the same way everywhere)

- **Real:** flights (Duffel test mode), the PayPal payment (sandbox), Channel3 products.
- **Synthetic fixtures:** hotels and activities.
- **Simulated:** the supplier booking after payment, and therefore the refunds the demo triggers.
- **Never a booking:** the rebooking agent's suggestions are only suggestions.
