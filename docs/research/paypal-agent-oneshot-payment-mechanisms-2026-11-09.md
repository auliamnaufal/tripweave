# PayPal "connect/top-up once, agent pays many suppliers" — mechanism-level feasibility

**Research date:** 9 November 2026
**Question:** Can a holiday-itinerary AI agent let a user connect/top-up their PayPal wallet once, then have the agent pay multiple third-party suppliers (airline, hotel, activity vendor) in one shot, without the user re-approving each individual payment — using documented, non-partner-gated PayPal primitives available to a hackathon entrant today?
**Builds on:** this report assumes and does not re-derive the conclusions already established in [`ai-holiday-itinerary-agent-paypal-booking-feasibility-2026-11-06.md`](ai-holiday-itinerary-agent-paypal-booking-feasibility-2026-11-06.md) (Orders v2 is merchant checkout, not wallet-spend-anywhere; Complete Payments Platform is approved-partner-only; no public self-serve "debit my PayPal at any merchant" API was found; travel-supplier APIs gate booking/payment separately) and the hackathon mechanics in [`paypal-ai-hackathon.md`](paypal-ai-hackathon.md). It goes one level deeper on the specific mechanisms (Vault, reference transactions, Agent Toolkit/MCP, PayPal's own agentic-commerce announcements, competing protocols) that those two docs flagged but did not fully chase.
**Scope:** desk research against primary sources only (developer.paypal.com, docs.paypal.ai, github.com/paypal/*, paypal.com/newsroom, and first-party docs of competing protocols for contrast). No sandbox calls made, no accounts opened.

## Recommendation

**Not achievable with documented, non-partner-gated PayPal primitives.** PayPal's Vault/Payment-Tokens API does let a buyer approve once and be charged again later without re-approving each time — but only by the *same* merchant of record that did the vaulting, or, if the buyer's token was vaulted at **platform** scope, by merchants the platform operator has individually onboarded as its own sellers under PayPal's Complete Payments Platform (approved-partner-only). There is no PayPal primitive, gated or not, that lets a plain merchant vault a user's wallet once and then have PayPal itself route payments to arbitrary, un-onboarded third parties (an airline, a hotel chosen at booking time) chosen by an agent after the fact. PayPal's own Agent Toolkit/MCP server — the literal "AI agent + PayPal" product — reinforces this: its `create_order` tool has no payee/merchant-override parameter, no split-payment tool, and no vault-charge tool; every tool call is scoped to the one merchant account whose credentials configured it. PayPal's 2025–2026 "agentic commerce" announcements (OpenAI ACP, Google UCP, Mastercard Agent Pay) are all PayPal-as-one-participating-payment-method inside someone else's protocol, and every one of those protocols is, by its own current spec, a single-merchant-per-authorization model — none of the four checked (ACP, AP2/UCP, Visa TAP, Mastercard Agent Pay) ships a "one consent, agent pays N unrelated merchants, protocol holds custody" model today; Google's own AP2 spec lists multi-merchant topologies as unbuilt future work.

**Closest honest architecture for a hackathon entrant (see §6):** the itinerary app collects one payment from the traveller — via a single PayPal Checkout (Orders v2) order, or a vault-and-charge-later flow scoped `usage_type: MERCHANT` — for a bundled trip-package sale that the **app itself is merchant of record for**. The app then pays each supplier itself, through whatever rail that supplier actually accepts (card, Duffel Balance, Booking.com's partner-collection model, etc., as already covered in the linked feasibility doc) — which may or may not be PayPal, and is a separate transaction the app funds out of the money it just collected. Multi-payee disbursement *through PayPal itself* (Complete Payments Platform payee-split, or platform-scoped vault reuse across onboarded sellers) exists as a PayPal capability, but requires approved-partner/platform status that is not available to a hackathon entrant in the submission window.

---

## 1. Vault API / "save payment methods" — what actually gets saved, and for whom

**What gets vaulted.** PayPal's current (v3) vaulting flow tokenizes a funding source:

> "A payment method is saved and exchanged for a unique token through a process called tokenization. The token is stored securely and used instead of the original account number." [S1]

Supported funding sources: "Credit and debit cards, PayPal Wallets, Venmo." [S1]

**Merchant-initiated charging without the buyer present.** This is a verified, documented capability — the exact pattern the product idea wants, but scoped to one merchant:

> "Payers can check out faster or pay without being present after they agree to save a payment method... If the payer is not present, you can charge their saved payment method." [S1]

> "Charge a customer's saved PayPal account without requiring the customer to approve each payment... The customer approves once. Then you can charge their PayPal account without them present." [S2]

The `stored_credential.payment_initiator` field formalizes this: `"MERCHANT"` is documented as "for merchant-initiated transactions where the payer is not present." [S3]

**Initial consent.** Vaulting a PayPal Wallet (as opposed to a card) requires an explicit one-time approval PayPal calls a "billing agreement":

> "Saving a PayPal Wallet requires payers to approve a billing agreement once." ... "Before you create a setup token, a payer must: Log in to their PayPal account; Approve a billing agreement." [S4]

**Not found in sources checked:** the literal wording PayPal's hosted consent screen shows the buyer at approval time (i.e., whether the screen itself discloses "any future amount" vs. a specific cap) — none of the fetched developer docs reproduce that screen copy.

**The crux question — can a vaulted token pay a payee *other than* the one that vaulted it?** Yes, but only inside a bounded, partner-gated set, not "any third party":

> "Save payment methods at the platform level - Supports a payer using a saved payment method with many merchants. For example, a payer saves their payment method on a marketplace's website, and can then use their saved payment method with any merchant on the marketplace." [S5]

The scoping mechanism is the `usage_type` field set when the setup token is created:

> "`usage_type` — Identifies the person or party who initiated the payment. Use `MERCHANT` if the payment token will be used by the merchant directly. Use `PLATFORM` for future transactions on a platform such as a marketplace where customers can purchase from multiple merchants." [S6]

But platform-scoped reuse is gated behind onboarding, not open-ended: "Before you can save payment methods, you'll need to onboard sellers." [S5] That onboarding is the standard Complete Payments Platform Partner Referrals flow (`merchantId`, `permissionsGranted`, `consentStatus` fields). [S7]

**Implication for the product idea.** An itinerary app vaulting a user's PayPal wallet at `usage_type: MERCHANT` can only charge that user again *itself* later — it cannot hand that token to PayPal and have PayPal pay an airline. Vaulting at `usage_type: PLATFORM` would let the *same vaulting entity*, now acting as a CPP platform, charge the user on behalf of **merchants it has individually onboarded as sellers** — not arbitrary suppliers the agent picks at booking time, and only after that platform-approval process. Either way, the itinerary app (or its platform-approved CPP account) remains the entity PayPal is charging on behalf of — not a mechanism for PayPal to independently settle with the airline or hotel.

## 2. Reference transactions / "future payments" — current terminology and status

PayPal has consolidated, not cleanly renamed, this area. The term "reference transaction" is still live in current (recently updated) developer docs, denoting an account-level permission a merchant must have before it can vault-and-later-charge a PayPal wallet:

> "You must be approved to enable a reference transaction if you want to save PayPal as a payment source. Contact your account manager for details." [S8]

> "You must be approved and have your account configured for billing agreements to set up a reference transaction." [S9]

Separately, the older **Billing Agreements API** (`/v1/payments/billing-agreements`) is formally deprecated:

> deprecated-resources table: "Billing Agreements → Current: Subscriptions." [S10]

— but note this specific deprecation entry is about the *recurring-billing* use case; it is not the same as "billing agreement" the one-time wallet-vaulting consent object, which survives unchanged inside the current v3 Payment Method Tokens / Vault flow ("Approve a billing agreement," [S4]). PayPal's own consumer help center confirms the transition direction:

> "Billing agreements will be replaced by payment tokens used in the Payment Method Tokens API... Payment Method Token APIs are the latest solution for saving payment methods to the vault. Billing Agreements APIs will be deprecated in the future." [S11]

**Net:** current canonical API/terminology is **Payment Method Tokens v3 / Vault** (v2 now lives under a `/api/limited-release/` path, suggesting it is being phased out in favor of v3). "Reference transaction" survives as the name of the account-level merchant permission required to vault+charge a PayPal wallet specifically (as opposed to a card); "billing agreement" survives as the name of the one-time buyer consent object. Neither term disappeared — both were folded under the Vault/Payment Tokens umbrella. This does not change the §1 conclusion: reference-transaction approval governs whether a merchant can charge *its own* vaulted customer again, not whether it can route that charge to a different payee.

## 3. PayPal Agent Toolkit and MCP server — the literal tool surface

This is the most direct test of whether PayPal's AI-agent product itself exposes any multi-payee or vault-charge capability. `github.com/paypal/agent-toolkit` is the canonical source; `@paypal/mcp` (the MCP server referenced by `github.com/paypal/paypal-mcp-server`) depends directly on `"@paypal/agent-toolkit": "latest"` [S12] — it is a thin MCP wrapper around the same tool code, not a separate implementation. `typescript/src/modelcontextprotocol/toolkit.ts` instantiates one `PayPalAPI` client from a single configured access token and registers each shared tool against that one client. [S13]

**Full tool catalog** (46 tools, from `typescript/src/shared/tools.ts` [S14], cross-checked against the current public doc page [S15]), by area: Invoices (`create_invoice`, `list_invoices`, `send_invoice`, `cancel_invoice`, recurring-series variants, etc.), Payments/Orders (`create_order`, `get_order`, `pay_order`, `create_refund`, `get_refund`), Catalog (`create_product`, `list_products`, `update_product`, `show_product_details`), Subscriptions (`create_subscription_plan`, `create_subscription`, `cancel_subscription`, etc.), Shipment tracking (`create_shipment_tracking`, `get_shipment_tracking`, `update_shipment_tracking`), Disputes (`list_disputes`, `get_dispute`, `accept_dispute_claim`), Reporting (`list_transactions`, `get_merchant_insights`).

**`create_order` schema — no payee override.** From `typescript/src/shared/parameters.ts` [S16]:

```ts
export const createOrderParameters = (context: Context) => z.object({
  currencyCode: z.enum(['USD']).describe('Currency code of the amount.'),
  items: z.array(z.lazy(() => lineItem)).max(50),
  discount: z.number().optional(),
  shippingCost: z.number().optional(),
  shippingAddress: z.optional(shippingAddress.nullable()).default(null),
  notes: z.string().optional().nullable().default(null),
  returnUrl: z.string().optional().default('https://example.com/returnUrl'),
  cancelUrl: z.string().optional().default('https://example.com/cancelUrl')
});
```

No `payee`, `merchant_id`, or `email_address` field. A full grep of `parameters.ts` for `payee|merchant_id` turns up exactly one unrelated hit (`payee_preferred`, a payment-method-preference enum inside the subscriptions schema, not an account identifier). The current public docs page confirms the same narrow schema (`items`, `currency` only) as of its "Last updated: October 29, 2026" stamp. [S15]

**This is a deliberate narrowing, not an API limitation.** The underlying PayPal Orders v2 REST API that `create_order` wraps does support specifying a different payee per purchase unit:

> `purchase_units.payee.email_address` — "The internationalized email address." `purchase_units.payee.merchant_id` — "The account identifier for a PayPal account." [S17]

The agent-toolkit's zod schema simply does not surface this field to the LLM tool caller.

**No split/multiparty tool.** No tool schema contains `payee`, `platform_fees`, or a multi-purchase-unit parameter; `create_order`'s `items` array only ever builds purchase units for the one implicit payee (the account that configured the toolkit).

**No vault-charge tool.** None of the 46 tool methods reference vault, setup tokens, or payment tokens. PayPal's separate Payment Method Tokens v3 / Vault API exists (§1 above) but is not wired into either `@paypal/agent-toolkit` or `@paypal/mcp` as a callable tool — `create_order`/`pay_order` only create-and-capture a fresh order the buyer approves fresh each time; "not found in sources checked" for any stored-token-charge tool.

**Conclusion (the crux of the whole report):** every exposed tool operates against the single merchant account whose OAuth credentials configured the toolkit/MCP server. The toolkit automates the **merchant's own PayPal account** — it cannot be pointed at a third party (an airline, a hotel) to pay on a consumer's behalf, and it cannot split or redirect a payment to another payee, using any tool it exposes. This is a product-design choice by PayPal (the capability exists one layer down in the raw REST API, gated as described in §1), not a hard platform impossibility — but as shipped, the "agent" in PayPal's own agent tooling automates a merchant, not a consumer wallet. No changelog, release notes, or dated doc page gave any evidence of a multi-merchant or consumer-wallet tool being added as of Nov 2026; this is reported as "not found," not as proof of permanent absence.

## 4. PayPal's own 2025–2026 public statements on agentic commerce

PayPal has made several agentic-commerce announcements in the research window, all via its own newsroom. None describes a single consumer authorization spanning multiple merchants; the "one-to-many" language PayPal itself uses is about a *merchant's* integration reaching many AI shopping surfaces, not a *consumer's* consent reaching many merchants:

> "One-to-many compatibility: A single PayPal integration can enable merchants to be seen across multiple AI shopping surfaces." ... "Preserve customer insights and relationships: ...merchants remain the merchant of record and retain control of brand visibility and customer communications for all agent-initiated transactions." — *PayPal Launches Agentic Commerce Services to Power AI-Driven Shopping*, Oct 28, 2025 [S18]

PayPal's role inside OpenAI's Agentic Commerce Protocol is explicitly as a participating payment processor, not a protocol operator or multi-merchant disburser:

> "PayPal will manage merchant routing, payment validation, and orchestration behind the scenes... via PayPal's ACP server—a trusted, scalable, and compliant access layer to a global network of merchants that will not require individual merchant integrations." ... "PayPal will also support OpenAI Instant Checkout through the delegated payments API, managing payment processing for card payments." — *OpenAI and PayPal Team Up to Power Instant Checkout and Agentic Commerce in ChatGPT*, Oct 28, 2025 [S19]

Even PayPal's own worked example of its Mastercard Agent Pay partnership is single-merchant, single-checkout, single-authorization-moment: "Tom selects his preferred pair... from a PayPal merchant and asks his agent to check out... Tom then verifies his identity..." — *Mastercard and PayPal Join Forces To Accelerate Secure Global Agentic Commerce*, Oct 27, 2025 [S20]

PayPal's most candid framing piece treats itself as a participant across multiple protocols, not the operator of any: "Protocols like UCP and ACP have started to lay the foundation... support for multiple protocols will be needed to enable commerce experiences with the leading platforms, including ChatGPT and Google Gemini." — *Making Sense of the AI Shopping Protocol Moment*, Jan 22, 2026 [S21]

PayPal's developer docs describe the same three integration paths (ACP via Braintree delegated tokens, UCP via Braintree/Google Pay, UCP via Orders v2), all per-merchant, per-checkout: "Customers authorize PayPal as their payment method. Your app receives a delegated token to process transactions through Braintree." — *Agent Ready overview*, last updated Oct 2026 [S22]

**Not found in sources checked:** any PayPal-authored statement describing one consumer authorization that lets an agent transact across multiple, unrelated merchants from that single consent. `docs.paypal.ai` could not be verified directly for this section — the domain 301-redirects to `developer.paypal.com/docsai/...`, which 404s; all PayPal protocol-participation detail above instead comes from `developer.paypal.com` (server-rendered, fetched cleanly with a plain fetch) and `newsroom.paypal-corp.com` (also server-rendered, fetched cleanly). `paypal.ai` itself is a thin marketing/sign-up page for "Store Sync" and returned noticeably short text on fetch — consistent with a JS-rendered page that doesn't fully serve content to a plain fetch; absence of a claim there is treated as unverified, not as confirmed absence.

## 5. Competing protocols — context only, not the main finding

First-party docs for each, checked only for (a) whether PayPal is named as a participating payment method, (b) whether the protocol's current model matches "one consent, agent pays many merchants," and (c) who holds custody of funds. Several of these sites (mastercard.com's Agent Pay product page in particular) are JS-rendered marketing pages that returned shorter text than their visual page on fetch — flagged below where relevant; treat unquoted claims there as unverified, not as confirmed absent.

- **OpenAI/Stripe Agentic Commerce Protocol (ACP)** — PayPal/Braintree is a live implementer per PayPal's own developer docs [S22]; OpenAI's spec itself names Stripe's Shared Payment Token as "the first" implementation "with more PSPs coming soon" without naming PayPal directly. [S23] Model is single-merchant per checkout session: "OpenAI is not the merchant of record... Merchants are expected to bring their own PSP and handle payments just as they do for accepting any other digital payment." Each payment token/mandate is scoped to one `merchant_id` with a max amount and expiry; "Settlement, refunds, chargebacks, and compliance remain with the merchant and their PSP." [S23][S24] Custody: merchant + merchant's PSP, per transaction — not OpenAI, not a pooled multi-merchant wallet.
- **Google Agent Payments Protocol (AP2) / Universal Cart Protocol (UCP)** — Google's own AP2 announcement names PayPal among 60+ collaborating organizations. [S25] AP2's own spec explicitly places multi-merchant, single-consent transactions in **unbuilt future work**: "Long-Term Vision: ...Native support for complex, multi-merchant transaction topologies." [S26] UCP's own developer FAQ: "No. You remain the Merchant of Record for all transactions." [S27] Custody stays with the merchant/merchant-payment-processor/credential-provider roles defined per transaction, never with Google.
- **Visa Trusted Agent Protocol (TAP)** — Visa's own named early-partner list (press release and developer getting-started page) does not include PayPal: Adyen, Ant International, Checkout.com, Coinbase, CyberSource, Elavon, Fiserv, Microsoft, Nuvei, Shopify, Stripe, Worldpay. [S28][S29] TAP is not a payment-movement protocol at all — it is a cryptographic agent-identity signature layer sitting in front of whatever payment rail the merchant already runs; it does not define or change who holds custody of funds. [S29]
- **Mastercard Agent Pay** — PayPal is named as a partner integrating Agent Pay into PayPal's wallet in a joint Mastercard/PayPal press release [S20], but that is a bilateral partnership announcement, not Mastercard's own protocol spec listing PayPal as a supported payment method inside the framework; Mastercard's own product page did not surface a PayPal mention in the text retrieved (flagged as unverified due to likely JS-rendering, not confirmed absence) [S30]. The mainstream Agent Pay flow is standard per-transaction card tokenization, single merchant per checkout. [S30] A separate, narrower October 2026 announcement, "Agent Pay for Machines," does describe one authorized budget spanning multiple payees — "Authorize once. Transact many times... Nine payments. Two independent merchants. One approved budget." — but this is scoped to machine-to-machine/API/digital-service payments (data, compute, APIs), not consumer retail checkout, and custody sits with a third-party agent wallet (BVNK) settling on Coinbase's Base chain, explicitly not with Mastercard. [S31]

**Takeaway for contrast:** no protocol checked — including the one PayPal itself is most publicly tied to (ACP) — currently ships a "one consent, agent pays N unrelated merchants, protocol/issuer holds custody" model for consumer retail. The one documented example that resembles it (Mastercard's Agent Pay for Machines) is a different product category (machine/API payments, crypto settlement, non-PayPal custody), not evidence that PayPal or a mainstream card network has solved this for the itinerary-agent use case.

## 6. The realistic architecture available today

Given §1–5, here is the topology buildable with documented, non-partner-gated PayPal primitives, mapped to the exact PayPal product each step uses:

| Step | What happens | PayPal product used | Partner-approval required? |
|---|---|---|---|
| 1. User funds/authorizes | User pays (or vaults, then is charged) a single bundled amount covering the whole trip package, to the itinerary app's own PayPal Business account | **Standard Checkout / Orders v2** (one-time), or **Vault (Payment Method Tokens v3) at `usage_type: MERCHANT`** + a later merchant-initiated charge | No — both are documented, self-serve APIs any sandbox app can call [S1–S4] |
| 2. Settlement | The itinerary app is merchant of record for that one sale; money lands in the app's own account | Orders v2 capture / Vault merchant-initiated charge | No |
| 3. Supplier payment | The app pays each supplier (airline, hotel, activity vendor) itself, out of money it already holds, through whatever rail that supplier accepts — this is a separate transaction the app initiates, not a PayPal-mediated disbursement to the supplier | Whatever the supplier's own booking/payment API requires (card, Duffel Balance, Booking.com partner-collection model, etc. — see the linked feasibility doc for specifics); may or may not itself be PayPal | Depends on the supplier API, not on PayPal |
| 4. (Only if PayPal itself is to route money directly to the supplier as a second payee, instead of step 3) | The app becomes a Complete Payments Platform **platform**, onboards each supplier as a seller, and either sets `purchase_units.payee` to that supplier per order or reuses a `usage_type: PLATFORM` vault token across its onboarded sellers | **Complete Payments Platform** (payee object / platform-fees / platform-scoped vault) [S5–S7][S17] | **Yes** — requires PayPal partner/platform approval and seller onboarding before any of this can be called live; not available to a hackathon entrant in the submission window |

Step 4 is the only PayPal-native way to make PayPal itself the thing that pays the airline and the hotel directly — and it is exactly the piece that is approved-partner-only, consistent with what the Nov-6 feasibility doc already found for Complete Payments Platform generally. Steps 1–3 are what is actually achievable without partner approval, and they do **not** give the user a "PayPal pays the airline" experience — they give the user "I paid the itinerary app once; the app is responsible for paying suppliers through its own means," which is a different (and less impressive, but honest) product claim.

## Facts / Inferences / Hypotheses / Limitations

**Facts (verified against primary sources, cited inline):**
- PayPal's Vault/Payment Method Tokens v3 API lets a merchant charge a vaulted wallet again later without the buyer re-approving each time, after one initial "billing agreement" approval. [S1–S4]
- That merchant-initiated charging capability is scoped by `usage_type` to either the single vaulting merchant (`MERCHANT`) or a platform's own onboarded sellers (`PLATFORM`), and platform-scope requires seller onboarding. [S5–S7]
- "Reference transaction" approval (an account-level merchant permission) is still required to vault-and-charge a PayPal wallet specifically, separate from the Billing Agreements API's deprecation for recurring billing. [S8–S10]
- PayPal's own Agent Toolkit/MCP server exposes 46 tools, all scoped to the one merchant account configuring the toolkit; `create_order` has no payee-override parameter even though the underlying Orders v2 API supports one; no tool splits payments across payees or charges a vaulted token. [S12–S17]
- PayPal's 2025–2026 agentic-commerce announcements (ACP, UCP, Mastercard Agent Pay) each describe PayPal as a participating payment method/PSP inside someone else's protocol, never as the operator of a multi-merchant, single-consent disbursement capability; every worked example given is single-merchant-per-authorization. [S18–S22]
- None of OpenAI's ACP, Google's AP2/UCP, Visa's TAP, or Mastercard's mainstream Agent Pay currently implement a "one consent, agent pays many unrelated merchants, protocol holds custody" model for consumer retail; Google's own AP2 spec lists this as future work. [S23–S30]

**Inferences:**
- The gap between "PayPal's raw API supports third-party payees" (§3, the `payee` object) and "PayPal's own agent tooling doesn't expose it" is a deliberate product-scoping choice, likely because exposing unrestricted payee-redirection to an LLM-driven tool call would be a significant fraud/compliance surface; this is inference, not a stated PayPal rationale (no PayPal source explaining the omission was found).
- The itinerary-app-as-merchant-of-record architecture (§6, steps 1–3) is the only version of this product that is buildable inside a hackathon timeframe without pursuing partner status.

**Hypotheses (not evidenced by this research):**
- Whether PayPal would grant a hackathon entrant platform/partner approval quickly enough to use step 4 live during the submission window.
- Whether users would find "I paid the app once, the app pays suppliers separately" a satisfying realization of "connect my wallet once and the agent handles everything" — this is a product-perception question, not addressed by any source here.

**Limitations:**
- `docs.paypal.ai` could not be fetched directly for this report (dead redirect to a 404); all PayPal-side agentic-commerce claims rely on `developer.paypal.com` and `newsroom.paypal-corp.com` instead, both of which fetched cleanly as server-rendered pages.
- `paypal.ai` (marketing/sign-up page) and Mastercard's Agent Pay product page returned shorter text than their visual pages on fetch, consistent with client-side-rendered content not served to a plain fetch; absence of a claim on those two pages specifically is reported as unverified, not as confirmed absence.
- The `github.com/paypal/paypal-mcp-server` repository's own file tree could not be fully crawled (timeout); its identity as a thin wrapper around `@paypal/agent-toolkit` is established via its published `package.json` dependency, not a full read of its own source tree.
- This report did not re-test anything in a live sandbox; all findings are desk research against current doc/source text as of 9 November 2026, which PayPal and the protocol operators can and do change.

## Sources

### PayPal Vault / Payment Method Tokens / reference transactions
- **[S1]** [Save payment methods overview](https://developer.paypal.com/v5/save-payment-methods/overview) (current redirect target of `/docs/checkout/save-payment-methods/`) — tokenization definition; merchant-initiated charging without payer present.
- **[S2]** [Charge a customer's saved PayPal account](https://developer.paypal.com/checkout/save-customer-info) — explicit "customer approves once, then charge without them present" language.
- **[S3]** [Save payment methods for recurring payments](https://developer.paypal.com/platforms/checkout/standard/customize/save-payment-methods-for-recurring-payments) — `stored_credential.payment_initiator: MERCHANT` field definition.
- **[S4]** [Save payment methods with purchase](https://developer.paypal.com/api/save-with-purchase/save-payment-methods) — billing-agreement approval requirement for vaulting a PayPal Wallet.
- **[S5]** [Save payment methods (platform-level)](https://developer.paypal.com/platforms/checkout/save-payment-methods) — platform-scoped vault reuse across onboarded merchants; seller-onboarding prerequisite.
- **[S6]** [Payment Method Tokens v3 — PayPal Wallet request definition](https://developer.paypal.com/api/payment-tokens/v3/definitions/paypal_wallet_request) — `usage_type: MERCHANT` vs `PLATFORM`.
- **[S7]** [Onboard merchants for platform-level vaulting](https://developer.paypal.com/platforms/checkout/save-payment-methods/onboarding/platform) — Partner Referrals onboarding fields.
- **[S8]** [Save payment methods during purchase (Orders API, PayPal)](https://developer.paypal.com/platforms/checkout/save-payment-methods/during-purchase/orders-api/paypal) — "must be approved to enable a reference transaction."
- **[S9]** [Save payment methods for purchase later (Payment Tokens API, PayPal)](https://developer.paypal.com/platforms/checkout/save-payment-methods/purchase-later/payment-tokens-api/paypal) — "must be approved and have your account configured for billing agreements."
- **[S10]** [REST API deprecated resources](https://developer.paypal.com/api/rest/deprecated-resources/) — Billing Agreements API deprecated in favor of Subscriptions (recurring-billing use case).
- **[S11]** [PayPal Help Center — converting billing agreements into payment tokens](https://www.paypal.com/us/cshelp/article/how-do-i-convert-my-billing-agreements-into-payment-tokens-help1084) — PayPal's own statement that Payment Method Tokens supersede Billing Agreements.
- **[S17]** [Orders v2 — purchase_units.payee object](https://developer.paypal.com/docs/api/orders/v2/) (schema reference) — `merchant_id` / `email_address` fields allowing a different payee per purchase unit.

### PayPal Agent Toolkit / MCP server
- **[S12]** [`@paypal/mcp` package](https://github.com/paypal/paypal-mcp-server) and its published `package.json` — depends directly on `@paypal/agent-toolkit`, confirming it is a thin wrapper, not a separate implementation.
- **[S13]** [`agent-toolkit` MCP registration source](https://github.com/paypal/agent-toolkit/blob/main/typescript/src/modelcontextprotocol/toolkit.ts) — single `PayPalAPI` client instantiated from one configured access token.
- **[S14]** [`agent-toolkit` shared tools source](https://github.com/paypal/agent-toolkit/blob/main/typescript/src/shared/tools.ts) — the 46-tool catalog.
- **[S15]** [PayPal AI agent tools documentation](https://developer.paypal.com/ai-tools/agent-tools) (last updated Oct 29, 2026) — public doc confirming the same narrow `create_order` schema.
- **[S16]** [`agent-toolkit` shared parameters source](https://github.com/paypal/agent-toolkit/blob/main/typescript/src/shared/parameters.ts) — exact zod schema for `createOrderParameters`/`captureOrderParameters`, no payee field.

### PayPal agentic-commerce announcements
- **[S18]** [PayPal Launches Agentic Commerce Services to Power AI-Driven Shopping](https://newsroom.paypal-corp.com/2025-10-28-PayPal-Launches-Agentic-Commerce-Services-to-Power-AI-Driven-Shopping) (Oct 28, 2025) — "one-to-many" framed as merchant-integration reach, not consumer-consent reach; merchants remain merchant of record.
- **[S19]** [OpenAI and PayPal Team Up to Power Instant Checkout and Agentic Commerce in ChatGPT](https://newsroom.paypal-corp.com/2025-10-28-OpenAI-and-PayPal-Team-Up-to-Power-Instant-Checkout-and-Agentic-Commerce-in-ChatGPT) (Oct 28, 2025) — PayPal's role as ACP payment processor/orchestrator, not protocol operator.
- **[S20]** [Mastercard and PayPal Join Forces To Accelerate Secure Global Agentic Commerce](https://newsroom.paypal-corp.com/2025-10-27-Mastercard-and-PayPal-Join-Forces-To-Accelerate-Secure-Global-Agentic-Commerce) (Oct 27, 2025) — single-merchant worked example; PayPal named as a Mastercard Agent Pay wallet partner.
- **[S21]** [Making Sense of the AI Shopping Protocol Moment](https://newsroom.paypal-corp.com/2026-01-22-Making-Sense-of-the-AI-Shopping-Protocol-Moment) (Jan 22, 2026) — PayPal frames itself as a multi-protocol participant, not an operator.
- **[S22]** [PayPal Agent Ready overview](https://developer.paypal.com/agent-ready/overview) (last updated Oct 2026) — ACP/UCP integration paths, all per-merchant/per-checkout-session.

### Competing protocols (first-party docs, context only)
- **[S23]** [OpenAI Agentic Commerce Protocol — payment spec](https://developers.openai.com/commerce/specs/payment) — merchant-of-record and settlement-stays-with-merchant-and-PSP language.
- **[S24]** [Agentic Commerce Protocol GitHub repository](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol) — spec source.
- **[S25]** [Google Cloud blog — announcing AP2](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol) — names PayPal among 60+ collaborating organizations.
- **[S26]** [AP2 protocol specification](https://ap2-protocol.org/ap2/specification/) — "Long-Term Vision" section lists multi-merchant transaction topologies as future work.
- **[S27]** [Google Universal Cart Protocol developer docs](https://developers.google.com/merchant/ucp) — "You remain the Merchant of Record for all transactions."
- **[S28]** [Visa Trusted Agent Protocol press release](https://usa.visa.com/about-visa/newsroom/press-releases.releaseId.21716.html) — named early-partner PSP list (PayPal absent).
- **[S29]** [Visa Developer Center — Trusted Agent Protocol](https://developer.visa.com/capabilities/trusted-agent-protocol) — identity/signature-layer framing, does not move money itself.
- **[S30]** [Mastercard — the agentic commerce framework](https://www.mastercard.com/us/en/news-and-trends/stories/2025/agentic-commerce-framework.html) — mainstream Agent Pay, per-transaction card tokenization.
- **[S31]** [Mastercard Agent Pay for Machines in action](https://www.mastercard.com/global/en/news-and-trends/press/2026/october/Mastercard-Agent-Pay-for-Machines-in-action.html) (Oct 2026) — one-budget/multi-payee model for machine/API payments, settled via BVNK + Coinbase Base, not Mastercard custody.

### Repository context
- [`paypal-ai-hackathon.md`](paypal-ai-hackathon.md) — hackathon rules, prizes, sandbox setup, and PayPal/sponsor tooling inventory this report builds on.
- [`ai-holiday-itinerary-agent-paypal-booking-feasibility-2026-11-06.md`](ai-holiday-itinerary-agent-paypal-booking-feasibility-2026-11-06.md) — established Orders v2/Complete Payments Platform boundaries and travel-supplier payment separation that this report assumes without re-deriving.

**Evidence convention (matching the linked reports):** a statement that a source "advertises," "documents," or "announces" something is a fact about that source's own public material, not independent proof of a shipped, tested outcome. Where a doc page required special handling to read (browser User-Agent, JS-rendered SPA, dead redirect), that is noted at point of use above rather than assumed away. Absence of a capability in the sources checked is reported as "not found in sources checked," not asserted as proof the capability doesn't exist anywhere in PayPal's product set.
