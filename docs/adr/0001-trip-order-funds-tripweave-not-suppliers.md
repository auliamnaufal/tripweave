---
status: partially superseded by ADR-0002 for suppliers willing to share their own PayPal email — see that ADR, including its verification-status note (the mechanism is implemented and unit-tested, not yet proven in a live sandbox run; that's tracked separately as GitHub issue #3). The reasoning below still holds fully for airlines (IATA BSP, unrelated to PayPal) and for any supplier unwilling/unable to share a PayPal account.
---

# Trip Order pays Tripweave, not the supplier directly

**Context:** The product pitch was "traveller connects/tops up PayPal once, and the agent one-shot pays the airline and hotel directly from that." `docs/research/paypal-agent-oneshot-payment-mechanisms-2026-11-09.md` found no documented, non-partner-gated PayPal primitive that lets a third party debit a consumer's PayPal account at multiple arbitrary merchants from one authorization — Vault only lets the *same merchant* that vaulted a payment method re-charge the *same buyer*; multi-payee routing exists only under Complete Payments Platform, which is approved-partner-only.

**Decision:** Tripweave is merchant of record for a single Trip Order (one PayPal approval, sized to the Itinerary Plan's total). Tripweave's own agent then executes each Supplier Booking separately, using Tripweave's own supplier credentials/funds — not the traveller's PayPal account.

## Considered Options

- **Rejected:** traveller's connected PayPal wallet pays each supplier directly. Not available without PayPal partner approval; would also require each supplier to accept PayPal from an unrelated third party, which travel suppliers generally don't expose.
- **Chosen:** Tripweave collects once, pays suppliers itself. Achievable with plain PayPal Orders v2 today; the "one-shot" promise is kept from the traveller's point of view (one payment covers everything) even though PayPal itself never touches the supplier leg.
