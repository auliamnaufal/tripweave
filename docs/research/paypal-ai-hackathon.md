# PayPal AI Hackathon — Research Notes

**Date accessed:** 2026-11-02

**Primary sources checked (fetched directly, not via secondary blogs):**

- https://paypalaihackathon.devpost.com/ (Overview / home page)
- https://paypalaihackathon.devpost.com/rules (Official Rules — most authoritative source for dates, prizes, judging, eligibility)
- https://paypalaihackathon.devpost.com/resources (Core PayPal integration links, sponsor-tool resource links, Inspiration categories)
- https://paypalaihackathon.devpost.com/details/aggrid, /apimatic, /astropods, /bryntum, /channel3, /elastic, /kernel, /postman, /render, /zapier (per-sponsor detail pages)
- https://paypalaihackathon.devpost.com/details/faqs (organizer FAQ)
- https://paypalaihackathon.devpost.com/updates (organizer announcements)
- https://developer.paypal.com/api/rest/, /dashboard/ (JS-rendered, limited), /docs/payouts/, /invoicing/about, /checkout/, /api/webhooks/overview
- https://docs.paypal.ai/, /developer/tools/ai/agent-toolkit-quickstart, /developer/tools/ai/mcp-quickstart
- https://github.com/paypal/AI-Toolkit (README)
- https://github.com/paypaldev/getting-started-with-paypal-sandbox (README)

The Devpost page itself required a browser-like `User-Agent` header to load (plain fetch returned 403); once fetched this way, it is server-rendered HTML, not thin/JS-only, so the content below is taken directly from that HTML. The `/api/hackathons/...` JSON endpoint pattern returned 404 for this challenge and was not used. `developer.paypal.com/dashboard/` is a JS-rendered single-page app — its content could not be read directly; setup steps for it are instead sourced from PayPal's own written guides (`getting-started-with-paypal-sandbox`, `api/rest/`).

---

## 1. What to Build

**No prescribed tracks or problem statements.** Per the Overview page:

> "There are no prescribed problem statements and no set of tracks. Build an agent, an app, an automation, a new payment experience, a business tool, a social product, or something we haven't thought of yet. The only fundamental requirement: your project must meaningfully use both PayPal and AI."
(https://paypalaihackathon.devpost.com/)

**Project requirements** (Overview page, confirmed verbatim in Rules §4 "Project Requirements"):
- Meaningfully integrate at least one PayPal technology, API, SDK, product, or developer capability (Rules clarifies this covers "all the services provided by PayPal such as Venmo, Braintree, Xoom, Honey, Zettle, Paidy, Hyperwallet, Simility, Swift Financial, and others").
- Meaningfully incorporate AI into the experience or functionality — "Any AI tool works, as long as PayPal integration is central to the project."
- Demonstrate a working prototype or proof of concept.
- Be sufficiently documented for judges to evaluate.
- Comply with the Official Rules.
- May be a new project, or significant, hackathon-period progress on an existing one (Rules §4, "New & Existing").

**Required vs. optional tech:**
- Required: PayPal developer platform (free sandbox environment) + an AI tool/model/platform of the entrant's choice.
- Optional: any of the 10 named sponsor tools (AG Grid, APIMatic, Astropods, Bryntum, Channel3, Elastic, KERNEL, Postman, Render, Zapier). "PayPal will provide access to select AI sponsor tools that you are welcome to use, though using one of these partner tools is not required." (https://paypalaihackathon.devpost.com/)

**Example use cases / inspiration** (verbatim from the "Inspiration" section, https://paypalaihackathon.devpost.com/resources):

- **AI Agents or Automation** — "Build autonomous agents or workflows that use PayPal to take action on a user's behalf — not just recommend, but actually transact." Examples given: an agent that shops and checks out for you, a scheduling assistant that pays contractors automatically on job completion, two agents negotiating and settling a payment between themselves (agent-to-agent commerce).
- **Money Movement Experiences** — a new, faster/simpler way to move money. Examples: send-money-by-phone-number app, freelancer cross-client payment dashboard, instant-on-approval payout tool for gig workers, receipt-scan bill-splitting, donation-splitting across causes.
- **Business Solutions** — tools for merchants/freelancers/creators/marketplaces. Examples: multi-currency invoicing tool for freelancers, creator tipping/membership tool, marketplace checkout that auto-splits platform/seller payment, POS add-on for small merchants.
- **Consumer Experiences** — everyday pay/track-money tools. Examples: auto-categorizing budgeting app, chat-embedded "request money," simplified checkout for underserved niche audiences.
- **Social Impact Ideas** — access/good-in-the-world uses. Examples: accessible (screen-reader, multi-language) donation platform, microloan/fundraising tool for underbanked users, nonprofit recurring donor-payout automation, neighbor-pooled community fund tool.

Each sponsor detail page also lists its own project-idea prompts specific to that tool (AG Grid dashboards/agents, Bryntum scheduling/Gantt boards tied to PayPal payment events, Channel3 shopping agents, etc.) — see Section 3 below.

**Sources:** https://paypalaihackathon.devpost.com/, https://paypalaihackathon.devpost.com/resources, https://paypalaihackathon.devpost.com/rules

---

## 2. Prizes

**Headline figures (as stated by organizers):** Overview page states "$67,500 in cash" in the stats bar and "Win part of $69,750 in total prizes" in the Why Join list (https://paypalaihackathon.devpost.com/). The Rules page §8 prize table is the authoritative breakdown; it reconciles exactly: $67,500 is the all-cash subtotal, and $69,750 = $67,500 cash + $2,250 in Render credits (non-cash) — see table below for confirmation of this arithmetic. (Note: APIMatic and Bryntum prize cash amounts are per-winner, multiplied by a qty of 3 winners each; this is why they are not immediately obvious from the headline total.)

### Grand Prizes (All Eligible Submissions)
| Place | Prize | Qty |
|---|---|---|
| 1st Place | $12,000 USD | 1 |
| 2nd Place | $8,000 USD | 1 |
| 3rd Place | $5,000 USD | 1 |

### Honorable Mention Prizes (All Eligible Submissions)
| Award | Prize | Qty |
|---|---|---|
| Most Creative | $5,000 USD | 1 |
| Most Impactful | $5,000 USD | 1 |
| Best Demo Delivery | $5,000 USD | 1 |
| Best Use of PayPal + AI | $5,000 USD | 1 |
| Best Use of Agentic Commerce | $5,000 USD | 1 |

### Sponsor Prizes (restricted to submissions using that sponsor's tool)
| Award | Prize | Qty |
|---|---|---|
| Best Use of AG Grid – 1st Place | $5,000 USD | 1 |
| Best Use of AG Grid – 2nd Place | $2,000 USD | 1 |
| Best Use of AG Grid – 3rd Place | $1,000 USD | 3 |
| Best Use of APIMatic | $1,000 USD + 6 months of APIMatic Business subscription | 3 |
| Best Use of Bryntum | $1,000 USD | 3 |
| Best Use of Channel3 | $1,500 USD | 1 |
| Best Use of Render – 1st Place | $1,000 Render credits | 1 |
| Best Use of Render – 2nd Place | $750 Render credits | 1 |
| Best Use of Render – 3rd Place | $500 Render credits | 1 |

**Arithmetic check:** Grand ($25,000) + Honorable Mention (5 × $5,000 = $25,000) + AG Grid ($5,000+$2,000+3×$1,000=$10,000) + APIMatic (3×$1,000=$3,000 cash) + Bryntum (3×$1,000=$3,000) + Channel3 ($1,500) = **$67,500 cash**, matching the Overview page. Adding Render credits ($1,000+$750+$500=$2,250, non-cash) gives **$69,750 total**, matching the Overview page's "total prizes" figure. (https://paypalaihackathon.devpost.com/rules, https://paypalaihackathon.devpost.com/)

**Multiple-prize rule (Rules §8, verbatim):** "A project can only win up to one (1) Grand Prize and one (1) Sponsor Prize OR one (1) Honorable Mention Prize and one (1) Sponsor Prize."

**Other perks:**
- Devpost Achievements (gamified badges) are mentioned on the Overview page ("Submitting to this hackathon could earn you:") but the specific badges were not rendered in the fetched HTML — **could not verify which achievements specifically** from the primary source.
- No mention of in-person meetings, 1:1 mentor calls, or swag as prizes was found on any primary page checked; **absence noted rather than assumed** — if such perks exist they were not stated on Overview, Rules, Resources, or sponsor detail pages.
- Prize delivery mechanics (Rules §8): winners must complete winner affidavits/required forms within 10 business days of being sent; prizes delivered within 60 days of form receipt; winners responsible for their own taxes/fees (W-9/W-8BEN as applicable).

**Sources:** https://paypalaihackathon.devpost.com/, https://paypalaihackathon.devpost.com/rules

---

## 3. Sponsors

Ten named sponsor tools plus PayPal itself as the hosting sponsor. Each sponsor's own detail page (`/details/<name>`) is Devpost-hosted but the descriptive copy is written/supplied by the sponsor.

### PayPal (host sponsor) — each capability explained separately, per instructions

PayPal is the hackathon's Sponsor of record (Rules §2: PayPal Inc., San Jose, CA). All of the below are documented at developer.paypal.com and docs.paypal.ai (linked from the Resources page).

- **PayPal REST API / Orders API (Checkout)** — https://developer.paypal.com/api/rest/, https://developer.paypal.com/checkout/
  What it is: PayPal's core server-side API for creating and capturing payments (Orders v2), authenticated via OAuth2 client-credentials. "Accept PayPal payments on your website. Customers can select the PayPal button on your site and pay with any funding source linked to their PayPal account." (developer.paypal.com/checkout/)
  How a team integrates it: get a Client ID/Secret from the Developer Dashboard, exchange them for an access token (`POST https://api-m.sandbox.paypal.com/v1/oauth2/token`), then call the Orders API server-side plus the PayPal JavaScript SDK v6 client-side to render the button and approve/capture an order. Solves: letting a user actually pay (not just simulate paying) inside a hackathon demo — the most direct way to satisfy the "meaningfully integrate PayPal" requirement for any consumer/checkout-shaped project.

- **PayPal Payouts API** — https://developer.paypal.com/docs/payouts/
  What it is: send money to many recipients at once (by email, phone, or PayPal ID), in 96 countries (Standard Payouts) via API, web-upload, or file transfer.
  How a team integrates it: call the Payouts API with a batch of recipient identifiers and amounts to disburse funds programmatically. Solves: the "pay contractors/gig workers/creators the moment a condition is met" pattern explicitly called out in the hackathon's "Money Movement" and "Social Impact" inspiration prompts (e.g., an agent that pays out the moment a task is approved, or a nonprofit automating recurring donor payouts to field partners).

- **PayPal Invoicing API** — https://developer.paypal.com/invoicing/about
  What it is: lets a merchant create, send, and track itemized invoices that customers pay via a secure hosted PayPal payment page, without the merchant building its own payment UI; supports PayPal, cards, Pay Later, Venmo, partial payments, and automatic reminders.
  How a team integrates it: use the Invoicing REST API to programmatically create/send/update invoices from a backend. Solves: billing/freelancer use cases named in the brief ("an invoicing tool built for freelancers who bill in multiple currencies") — distinct from Payment Links or Checkout because it targets a *specific named customer* and supports partial payments and reminders.

- **PayPal Webhooks** — https://developer.paypal.com/api/webhooks/overview
  What it is: HTTPS callbacks PayPal posts to a developer's server whenever a subscribed event occurs (e.g., `PAYMENT.SALE.COMPLETED`), the reverse direction of a normal API call — essential for reacting to async events like a subscription renewal, a dashboard-initiated refund, or a redirect-based payment becoming ready to capture.
  How a team integrates it: register a listener URL per app (up to 10 URLs/app) and subscribe to specific event types (or `*` for all); the endpoint must return 2xx or PayPal retries up to 25 times over 3 days; verify authenticity via CRC32 signature check or PayPal's verify-signature endpoint. Solves: any "agent watches payment events and reacts" idea — e.g., the Bryntum sponsor's suggested "agent-driven rescheduler" that moves a Gantt milestone when a payment fails or a refund posts.

- **PayPal AI Toolkit / Agent Toolkit / MCP server** — https://docs.paypal.ai/, https://docs.paypal.ai/developer/tools/ai/agent-toolkit-quickstart, https://docs.paypal.ai/developer/tools/ai/mcp-quickstart, https://github.com/paypal/AI-Toolkit
  What it is: PayPal's own SDK/toolkit for wiring PayPal APIs (orders, invoices, subscriptions, shipment tracking, transactions, disputes) into AI agent frameworks — Amazon Bedrock, CrewAI, LangChain, OpenAI Agents SDK, Vercel AI SDK, and **Model Context Protocol (MCP)**. The MCP server specifically lets any MCP client (Claude, Cursor, Cline, etc.) manage PayPal resources ("list my PayPal invoices for last month") via natural language, run locally (`npx -y @paypal/mcp --tools=all`) or remotely (`https://mcp.sandbox.paypal.com`). The AI-Toolkit GitHub repo is a coding-agent plugin (Claude Code / Codex / Cursor) that bundles the MCP server with a "best practices" skill and slash commands (`/paypal:setup`, `/paypal:sandbox`, `/paypal:doctor`).
  How a team integrates it: set `PAYPAL_ENVIRONMENT=SANDBOX` and a sandbox access token in the MCP client config, or install the AI-Toolkit plugin directly into their coding agent. Solves: the AI-agent-driven, agent-to-agent-commerce category of ideas specifically — this is the natural-language/agentic layer on top of the raw REST APIs above, distinct from them because it is agent-facing rather than application-facing.

### Sponsor tools (10, each with its own `/details/<name>` page — content below is quoted/paraphrased from those pages, which in turn largely quote the sponsor's own language)

1. **AG Grid** (https://paypalaihackathon.devpost.com/details/aggrid) — "the company behind the data grid, charts, and dashboards powering over half of the Fortune 500." Their hackathon product is **AG Studio**, an embeddable analytics/dashboard component bundling grids, charts, a built-in data engine, cross-filtering, and a "Studio Agent Framework" so an agent can build/query/edit dashboards. Integration: npm install, free 45-day trial license, PayPal-prewired boilerplate provided. Problem solved: building a polished analytics dashboard (e.g., transaction/revenue dashboards) without hand-rolling charting UI; the Studio Agent Framework specifically lets a custom or built-in agent manipulate the dashboard, fitting an "AI + dashboard" project.

2. **APIMatic** (https://paypalaihackathon.devpost.com/details/apimatic) — "helps developers and AI agents build reliably with APIs," turning API contracts into SDKs, API portals, and **Context Plugins for AI coding agents** (so a tool like Claude Code pulls PayPal API context automatically instead of the developer reading docs manually). Integration: use the APIMatic Context Plugin for PayPal (PayPal is pre-enabled, no extra credentials needed); free subscription tiers for participants (1 month Basic) and winners who used the plugin (6 months Business). Problem solved: reduces time spent digging through PayPal API reference while coding — a dev-tooling accelerant rather than an end-user feature.

3. **Astropods** (https://paypalaihackathon.devpost.com/details/astropods) — "the agent operating system for running AI agents in production": models, knowledge bases, tool integrations, observability, plus runtime/guardrails, deployed via a declarative spec + CLI, managed via API/dashboard. Integration: free account sign-up, declarative agent spec, CLI build/push, deploy via API/dashboard. Problem solved: hosting and monitoring an AI agent in production (beyond a local prototype) — relevant to any team building an autonomous/long-running agent rather than a single-turn chatbot.

4. **Bryntum** (https://paypalaihackathon.devpost.com/details/bryntum) — builds **Gantt** (dependency-aware task timelines), **Scheduler** (resource/time-slot booking with drag/drop), and **Calendar** (day/week/month/agenda views) UI components. Integration: 45-day trial (`npm install @bryntum/scheduler@npm:@bryntum/scheduler-trial`). Problem solved: any project needing a visual timeline/calendar tied to payment events — their own suggested ideas include a Gantt board where a late PayPal payment visibly blocks a dependent task, and an agent that reschedules bookings when a payment fails/succeeds/refunds.

5. **Channel3** (https://paypalaihackathon.devpost.com/details/channel3) — a single API/MCP server returning normalized product data (titles, images, prices, variants, availability, buy links) across 100M+ products from 25,000+ retailers, no scraping required; used to build shopping agents, gift finders, AI stylists, comparison tools. Integration: sign up at trychannel3.com/developers, grab an API key, no credit card; promo code `PAYPAL-HACKATHON-2026` for 20,000 free API credits (20,000 product searches). Note: "Projects that only reference Channel3 without calling it will not meet this requirement" for its sponsor prize. Problem solved: product-discovery/search data for an AI shopping agent that then checks out via PayPal — pairs naturally with PayPal Checkout/Orders API for an "agent that shops and checks out for you" project.

6. **Elastic** (https://paypalaihackathon.devpost.com/details/elastic) — "the search AI company," makers of **Elasticsearch**, an open-source distributed search/analytics engine for structured, unstructured, and vector data; supports hybrid/vector search, real-time analytics, and AI features (Elastic Agent Builder, Workflows, ES|QL, Observability, Security, A2A/MCP connectivity). Integration: 14-day free trial via `ela.st/elastic-paypal-hackathon` (self-extendable 30 more days), or run Elasticsearch locally for free. Problem solved: retrieval/RAG backend for an AI agent — e.g., semantic search over transaction history or support content, or building a multi-step agent combining Elasticsearch with a Jina embedding model (their suggested starting point).

7. **KERNEL** (https://paypalaihackathon.devpost.com/details/kernel) — cloud infrastructure for AI agents to act on the internet: <30ms browser spin-up, bot anti-detection for protected sites, 24fps live session view with replay, durable login/auth so agents stay logged in, real headful Chromium (handles pop-ups/iframes/new windows). Integration: sign-up link for $50 in KERNEL credits. Problem solved: giving an AI agent a reliable, remotely-controllable browser to take actions on websites (e.g., an agent that needs to browse and transact on a site that has no API) — infrastructure layer underneath an agent, not a payments feature itself.

8. **Postman** (https://paypalaihackathon.devpost.com/details/postman) — "a unified platform for designing, testing, distributing, documenting, and monitoring APIs," with team collaboration/governance features. Integration: free Postman account; a published PayPal API collection on Postman for exploring/testing PayPal endpoints without writing a client first. Problem solved: fast, no-SDK way to explore and test PayPal REST calls (including getting an access token) before writing integration code — a dev-workflow tool, not a feature inside the shipped app.

9. **Render** (https://paypalaihackathon.devpost.com/details/render) — "an intuitive cloud platform for developers who want to ship production-grade apps and agents without managing infrastructure": push-to-deploy web services, databases, workflows, long-lived workers, automatic scaling/networking/zero-downtime deploys. Integration: $50 in Render credits via a sign-up link; **Render Workflows** (an orchestration/execution engine) to coordinate AI agents, background jobs, and data pipelines via a lightweight SDK, dispatched across many concurrent instances. Problem solved: hosting the hackathon submission itself (satisfying the "hosted demo URL" submission option) and/or running background agent jobs reliably.

10. **Zapier** (https://paypalaihackathon.devpost.com/details/zapier) — **Zapier MCP** lets AI tools (Claude, ChatGPT, Cursor) "take real action across 9,000+ apps, including PayPal," handling login/permission flows so the builder doesn't have to. Integration: create a Zapier account (automatic 14-day trial of Zapier Professional, then drops to Free); connect via Zapier MCP quickstart. Problem solved: giving an AI agent action-ability across many third-party apps (e.g., trigger a Slack message or update a spreadsheet) alongside PayPal, without building individual API integrations for each app.

**Sources:** https://paypalaihackathon.devpost.com/details/aggrid, /apimatic, /astropods, /bryntum, /channel3, /elastic, /kernel, /postman, /render, /zapier; https://developer.paypal.com/api/rest/, /checkout/, /docs/payouts/, /invoicing/about, /api/webhooks/overview; https://docs.paypal.ai/, /developer/tools/ai/agent-toolkit-quickstart, /developer/tools/ai/mcp-quickstart; https://github.com/paypal/AI-Toolkit

---

## 4. Sandbox / Developer Setup

Sourced from https://paypalaihackathon.devpost.com/rules (§4 "How To Enter"), https://developer.paypal.com/api/rest/, and PayPal's own guide repo https://github.com/paypaldev/getting-started-with-paypal-sandbox.

**Account creation:**
- "To access the PayPal sandbox environment, use your existing PayPal account or create a free account at https://developer.paypal.com/." (Rules §4)
- A PayPal account is free; the same login works for both `www.paypal.com` and the Developer Dashboard — there is no separate "developer sign-up" step. Signing in to the Developer Dashboard is what auto-generates your default sandbox accounts.
- FAQ note on country availability: "PayPal account sign-up options vary by country... if you can't complete sign-up from where you live... please ask the PayPal team in the PayPal Discord. Being able to open a PayPal account is separate from hackathon eligibility." (https://paypalaihackathon.devpost.com/details/faqs)

**Sandbox vs. live mode:**
- Two separate PayPal "universes" with their own URLs: `developer.paypal.com` (manage sandbox accounts/apps/credentials, sign in with your real PayPal login) vs. `www.sandbox.paypal.com` (approve/review test payments, sign in with a generated sandbox test account). Code calls a third URL, the sandbox API base `https://api-m.sandbox.paypal.com`.
- Going live later means swapping `sandbox.paypal.com` → `paypal.com` and `api-m.sandbox.paypal.com` → `api-m.paypal.com`; the Developer Dashboard itself has a Sandbox/Live toggle rather than being a separate site.
- Important caveat from developer.paypal.com/api/rest/: "You'll need a PayPal Business account to... go live with integrations [or] test integrations outside the US." (US-only testing is possible without a Business account.)

**Account types needed:** a real payment flow needs both a Personal sandbox account (buyer) and a Business sandbox account (seller). PayPal auto-creates one default Business account (with test API credentials) and one default Personal account on first Developer Dashboard login; more can be created via Testing Tools → Sandbox Accounts → Create Account (choose type + country; "Create Custom Account" for custom balances/cards). Default accounts use fake addresses like `sb-xxxx@business.example.com` and cannot be deleted.

**Where to get Client ID / Secret (minimum steps to first API call):**
1. Log in to the Developer Dashboard (developer.paypal.com) → select **Apps & Credentials**.
2. A **Default Application** already exists in the REST API apps section; or click **Create App** for a new one.
3. Copy the **Client ID** and **Client Secret**.
4. Exchange them for an access token:
   ```
   curl -v -X POST "https://api-m.sandbox.paypal.com/v1/oauth2/token" \
     -u "CLIENT_ID:CLIENT_SECRET" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=client_credentials"
   ```
5. Use the returned `access_token` as a bearer token on subsequent REST calls (e.g., Orders API to create/capture a payment).
(https://developer.paypal.com/api/rest/)

**No code-free option:** PayPal APIs can also be tried in Postman without a Developer account, via PayPal's published Postman collection, if a team wants to explore endpoints before writing a client.

**Rate limits / restrictions relevant to a hackathon:** No explicit sandbox rate-limit numbers were published on any primary page checked — **this could not be verified from a primary source** and should not be assumed. The only documented numeric constraint found is unrelated to PayPal itself: webhooks retry delivery "up to 25 times over the course of 3 days" if your endpoint doesn't return 2xx (developer.paypal.com/api/webhooks/overview), and up to 10 webhook listener URLs are allowed per app.

**AI/agent layer setup (for MCP/Agent Toolkit use):** set `PAYPAL_ENVIRONMENT=SANDBOX` and either a sandbox access token or `PAYPAL_ACCESS_TOKEN` env var in the MCP client config (local: `npx -y @paypal/mcp --tools=all`; remote sandbox endpoint: `https://mcp.sandbox.paypal.com`), per https://docs.paypal.ai/developer/tools/ai/mcp-quickstart. Tokens expire in up to 8 hours depending on scope (per https://github.com/paypal/AI-Toolkit README).

**Approvals:** no manual PayPal approval step was found gating sandbox access for hackathon participants — sign-up and Developer Dashboard login appear sufficient. (Could not verify any hidden approval/allowlisting step beyond what the FAQ describes for country-restricted sign-ups.)

**Sources:** https://paypalaihackathon.devpost.com/rules, https://paypalaihackathon.devpost.com/details/faqs, https://developer.paypal.com/api/rest/, https://github.com/paypaldev/getting-started-with-paypal-sandbox, https://docs.paypal.ai/developer/tools/ai/mcp-quickstart, https://github.com/paypal/AI-Toolkit

---

## 5. Getting Started Checklist

Ordered, sourced from the Overview page's own "Get started" section, Rules §4 "How To Enter," and the Updates/FAQ pages. Nothing below is invented.

1. **Register on Devpost.** Visit https://paypalaihackathon.devpost.com/, click "Join Hackathon," and sign up for (or log into) a free Devpost account. (Rules §4)
2. **Get a PayPal Developer account** — "5 minutes," per the Overview page's own "Get started" list — at https://developer.paypal.com/ (use an existing PayPal login or create a free one).
3. **Join the PayPal Discord** for sponsor-tool access help, country/eligibility questions, and general support — link given on the Resources page (https://discord.gg/sJ2G6DyvSK), separate from the general Devpost Discord (https://discord.com/invite/HP4BhW3hnp).
4. **Review example projects and brainstorm** — Overview page lists this as a ~30-minute step; use the "Inspiration" categories on the Resources page and each sponsor's project-ideas list.
5. **(Optional) Watch or catch up on the webinars** — "Start Building with PayPal" (Oct 6, recording on YouTube), "Power Your PayPal Hackathon Project with APIMatic Context Plugins" (Oct 7), "Build a payments dashboard without building a dashboard" (Oct 12), repeat session (Oct 13). Links on the Overview page.
6. **Create/open your PayPal sandbox app** in the Developer Dashboard (Apps & Credentials) to get a Client ID/Secret, and note your default Personal + Business sandbox test accounts (see Section 4 above).
7. **(Optional) Install the PayPal AI Toolkit plugin** for your coding agent (Claude Code / Cursor / Codex) via `/plugin install paypal@claude-plugins-official` (Claude Code) or the equivalent for your tool, and configure `PAYPAL_SANDBOX_ACCESS_TOKEN`. (github.com/paypal/AI-Toolkit)
8. **(Optional) Sign up for any sponsor tools you plan to use** — each has its own sign-up/credit link on its `/details/<name>` page (e.g., Channel3 promo code `PAYPAL-HACKATHON-2026`, Render $50 credit link, Elastic 14-day trial link, Bryntum 45-day trial, AG Grid 45-day trial).
9. **Build**, keeping PayPal + AI integration "central to the project" (per Rules/FAQ wording), during the Submission Period (Oct 1 – Nov 12, 2026).
10. **Submit early if possible** — per the Nov-2026 update: "Submit by Thursday, Nov 5 and our review team will check your project for eligibility early and flag anything to fix. You can keep editing until the deadline." (https://paypalaihackathon.devpost.com/updates)
11. **Submit via the "Enter a Submission" page** on the Hackathon Website before the deadline, including all required materials (Section 6 below).

**Sources:** https://paypalaihackathon.devpost.com/, https://paypalaihackathon.devpost.com/rules, https://paypalaihackathon.devpost.com/resources, https://paypalaihackathon.devpost.com/updates, https://github.com/paypal/AI-Toolkit

---

## 6. Submission Requirements & Deadlines

**Deadlines (Rules §1, verbatim dates):**
- Submission Period: **Thursday Oct 1, 2026 (9:15 am Pacific Time) – Thursday Nov 12, 2026 (12:00 pm Pacific Time)**.
- Judging Period: Tuesday Dec 1, 2026 (2:00 pm PT) – Tuesday Dec 15, 2026 (8:00 am PT).
- Winners Announced: on or around Monday, Dec 21, 2026 (2:00 pm PT).
- The Overview page's stats bar independently states "Deadline: Nov 12, 2026 @ 12:00pm PST" — consistent with the Rules page (note Rules says "Pacific Time" generically, which is PST in November).
- Early-review encouragement (not a hard deadline): submit by Nov 5, 2026 for an eligibility pre-check (https://paypalaihackathon.devpost.com/updates).

**What must be submitted** (Overview page "What to Submit," cross-confirmed against Rules §4 "Submission Requirements"):
1. **Project** — built with the required developer tools (PayPal sandbox + an AI tool), meeting the Project Requirements in Section 1 above.
2. **Text description** — explaining the project's features and functionality.
3. **Functional demo** — judges must be able to actually run or interact with a working build, satisfied by *either*:
   - Clear, complete setup/run instructions in the code repo, or
   - A hosted demo URL.
   - Explicitly disallowed: "A design mockup, static prototype, or non-functional demo does not meet this requirement."
4. **Tools used** — identify which AI model/service was used and explain how.
5. **Public code repository** on GitHub, GitLab, or Bitbucket — "must contain all source code, assets, and instructions needed to run the project," and "must be public and open source, with a license file visible at the top of the repo (in the About section)."
6. **Demo video** — under 3 minutes ("judges aren't required to watch past that"), must show the project functioning on its target device, must be uploaded to YouTube and publicly visible with the link on the submission form, and must not include unlicensed third-party trademarks or copyrighted music/material.

**Multiple submissions:** allowed, but each must be "unique and substantially different" (Rules §4).

**Judging process (Rules §6):**
- **Stage One (pass/fail):** "will determine via pass/fail whether the ideas meet a baseline level of viability, in that the Project reasonably fits the theme and reasonably applies the required APIs/SDKs featured in the Hackathon."
- **Stage Two (scored):** five equally-weighted criteria, quoted verbatim (same wording appears on both the Overview and Rules pages):
  - **Technological Implementation:** "How thoroughly and skillfully does the project use PayPal Developer Platform and AI tool(s)? Does the project reflect genuine effort and a working, non-trivial implementation?"
  - **Design:** "Does the project deliver a complete, coherent product experience — not just a technical proof of concept?"
  - **Potential Impact:** "Does the project make a credible, specific case for solving a real problem for a real audience — and does the solution actually address that problem based on what's demonstrated?"
  - **Innovation/Idea:** "How creative and novel is the concept and does the project differ from existing concepts?"
  - **Presentation:** "Does the video clearly demonstrate the project working end-to-end? Does the pitch communicate what problem is solved, who it's for, and why it matters? Is the overall presentation easy to follow?"
- **Tie-breaking:** resolved by walking down the criteria list in order; if still tied on all criteria, the judge panel votes.

**Eligibility restrictions (Rules §3):** open to individuals at legal majority age, teams, and organizations, worldwide, **except** residents/organizations in countries where US or local law prohibits participation — explicitly named: Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea, and any other OFAC-comprehensively-sanctioned country/territory. Hackathon employees/agents, judges, and their immediate family/household are also excluded.

**Contact:** "Questions? Email the hackathon manager (janet@devpost.com)" (Overview page); sponsor/PayPal-specific questions route to the PayPal Discord (https://discord.gg/sJ2G6DyvSK).

**Sources:** https://paypalaihackathon.devpost.com/, https://paypalaihackathon.devpost.com/rules, https://paypalaihackathon.devpost.com/updates, https://paypalaihackathon.devpost.com/details/faqs

---

## Items that could not be verified from a primary source

- The specific **Devpost Achievements** badges mentioned on the Overview page (section present but content not rendered in the fetched HTML).
- Any **swag, mentor 1:1s, or in-person meeting perks** — not mentioned on Overview, Rules, Resources, or any sponsor detail page; their absence from these pages is reported as-is, not assumed to mean they don't exist.
- **PayPal sandbox API rate limits** (requests/minute, etc.) specific to this hackathon — no numeric limit was published on any primary page checked.
- Content of `https://developer.paypal.com/dashboard/` directly — it is a client-side-rendered SPA; dashboard steps above are sourced from PayPal's written guides referencing it, not from scraping the dashboard page itself.
- Whether a Devpost-hosted `/api/...` JSON endpoint exists for this specific challenge — `https://paypalaihackathon.devpost.com/api/hackathons/paypalaihackathon` returned HTTP 404 when checked.
