---
status: accepted and implemented — verified by unit tests against PayPal's
documented Orders v2 multi-payee purchase-unit shape. Not yet verified against
a real sandbox run with real third-party payee accounts; that is tracked
separately as GitHub issue #3 and is still open as of 2026-11-10.
---

# Multi-payee orders pay an Onboarded Supplier directly

**Context:** ADR-0001 rejected letting the traveller's own PayPal account pay
each supplier directly, because no documented PayPal primitive lets a third
party debit one PayPal account at multiple arbitrary merchants without
partner approval. Separately, PayPal's Orders v2 API documents a mechanism
any merchant of record can use with no partner approval at all: a single
order may carry more than one `purchase_unit`, and each unit may set its own
`payee.email_address`. That lets a supplier who shares their own PayPal email
receive their line item directly — on the same order, under the same single
approval the traveller already gives Tripweave — without Tripweave ever
needing partner-routing approval.

**Decision:** When an offer carries a `supplierPayeeEmail` (an "Onboarded
Supplier," see `GLOSSARY.md`), it becomes its own `purchase_unit` with that
`payee`, on the same Trip Order. Every other offer is still summed into one
shared bundle unit under Tripweave's own account, unchanged from ADR-0001.
See `planPurchaseUnits` in `src/features/payments/paypal.ts`.

## Considered Options

- **Rejected:** route every supplier payment through a partner-approved
  platform (PayPal Complete Payments Platform). Available in principle, but
  gated behind partner approval not reachable in the hackathon window.
- **Chosen:** a per-unit `payee` on the same order, for suppliers willing to
  share a PayPal email. Works today with plain Orders v2, no partner
  approval, and keeps the "one approval pays for everything" promise from
  the traveller's point of view.

## Consequences

- A supplier that doesn't or can't share a PayPal email still goes through a
  Supplier Booking (ADR-0001's default) — unchanged.
- This still doesn't apply to airlines (IATA BSP settlement, unrelated to
  PayPal) — same carve-out as ADR-0001.
- **Verification status, stated plainly:** the purchase-unit shape matches
  PayPal's own Orders v2 documentation and is covered by unit tests
  (`paypal.test.ts`) that assert the exact request and response bodies. It
  has **not** been run end-to-end against a real sandbox order, approved and
  captured across real third-party accounts, with balances checked — that
  live verification is GitHub issue #3, still open. Until #3 closes, this is
  "implemented and documented, not yet proven live" — nothing elsewhere in
  the codebase should claim otherwise.
