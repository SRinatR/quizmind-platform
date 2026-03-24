# ADR 0002: Billing Provider Abstraction

- Status: accepted
- Date: 2026-03-24

## Decision

Billing uses a provider-agnostic orchestration layer with normalized provider IDs and webhook events. Stripe is the first live self-serve adapter. Manual invoicing and mock are first-class adapters.

## Consequences

- Public contracts expose normalized provider fields.
- Schema stores provider-normalized IDs alongside temporary Stripe legacy fields.
- Worker logic maps provider webhooks into normalized billing state transitions.
