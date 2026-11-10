# Tripweave

Tripweave is a constraint-aware holiday itinerary planner. A traveler describes an origin, destination, dates, budget, and preferences, and an agent searches real flights plus sample hotels and activities, then assembles a plan. Deterministic code owns totals and hard constraints. PayPal sells the finished plan as the app's own product, not a travel booking.

## How it works

- The user submits a `TripBrief` to `POST /api/plan`.
- A LangGraph ReAct agent calls three search tools (`search_flights`, `search_hotels`, `search_activities`) and a `build_itinerary` tool.
- `search_flights` calls Duffel's test-mode API for real offers. `search_hotels` and `search_activities` still return synthetic fixtures: there's no instant self-serve real-data option for either right now (Amadeus's self-service program, hotels included, closed in July 2026; Duffel's hotel API needs a separate access request, not instant signup).
- `build_itinerary` is deterministic. It computes totals and checks budget, trip window, and schedule overlaps. The model selects offers; it cannot change prices, totals, or feasibility.
- The server recomputes the plan from the agent's selected offer ids before returning it, so the model's output never sets the numbers.
- `POST /api/payments/order` and `POST /api/payments/capture` run PayPal checkout for the app's own plan (a fixed $5 deliverable). They do not book travel or pay suppliers.

Flight offers are real, retrieved from Duffel at request time. Hotels and activities stay synthetic. Nothing is booked or reserved; the app only searches and prices.

## Run locally

1. Install Node.js 22 or later and pnpm.
2. Install dependencies with `pnpm install`.
3. Copy `.env.example` to `.env.local`.
4. Set `OPENAI_API_KEY` to your OpenAI API key. `OPENAI_MODEL` defaults to `gpt-6-luna`.
5. Set `DUFFEL_API_KEY` from a free test-mode account at [duffel.com](https://duffel.com) ("Create account" on the dashboard; no sales call needed). Without it, flight search returns a 503.
6. Optionally set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` for the sandbox checkout.
7. Start the app with `pnpm dev` and open `http://localhost:3000`.

## Model provider

The planner and booking agents call the OpenAI API (`/v1/chat/completions`) through LangChain's `ChatOpenAI`, using `OPENAI_API_KEY` and `OPENAI_MODEL` (default `gpt-6-luna`). `gpt-6-luna` only accepts the default temperature, so the app doesn't set one. Keep the key out of the browser bundle and logs.

## Data and product limits

- Traveler identity is fictional; nothing collects passenger identity. Flight prices and availability are real, retrieved from Duffel's test environment at request time. Hotel and activity data is synthetic.
- The app does not create reservations or book travel. Search and pricing only.
- PayPal capture only pays for Tripweave's own itinerary plan. It is not evidence of a hotel or flight booking, and it does not pay a supplier.

Any future supplier or booking work must first verify supplier access, allowed payment methods, booking status, cancellation and refund behavior, and support ownership.

## Checks

- `pnpm test` runs deterministic planner, supplier, agent, route, and PayPal tests.
- `pnpm typecheck` checks TypeScript.
- `pnpm lint` runs ESLint.
- `pnpm build` creates a production build.
