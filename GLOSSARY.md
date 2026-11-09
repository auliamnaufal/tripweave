# Tripweave

An AI travel-planning app. A traveller describes a trip; the agent proposes an Itinerary Plan; the traveller pays Tripweave once; Tripweave's agent then carries out each individual supplier purchase on the traveller's behalf.

## Language

**Itinerary Plan**:
The traveller-facing set of selected offers (flights, hotel, activities), their total cost, and feasibility against budget — generated before any payment or booking happens.
_Avoid_: trip, itinerary (bare), when a precise pipeline stage matters.

**Trip Order**:
The single PayPal payment a traveller approves, sized to the Itinerary Plan's full total. Tripweave is the merchant of record. This is the one and only moment the traveller's own PayPal account is involved — there is no stored credential and no standing wallet access beyond this one approval.
_Avoid_: wallet connection, top-up, connected wallet, booking payment.

**Supplier Booking**:
An individual purchase (one flight, the hotel, one activity) that Tripweave's agent executes against a travel supplier *after* a Trip Order captures, using Tripweave's own supplier credentials and funds — never the traveller's PayPal account. The traveller's PayPal payment funds Tripweave; it does not reach the supplier directly.
_Avoid_: booking, reservation, purchase (without naming who is paying whom).
