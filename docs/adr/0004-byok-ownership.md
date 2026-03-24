# ADR 0004: BYOK Ownership And Governance

- Status: accepted
- Date: 2026-03-24

## Decision

All provider credentials are owned by the platform, a workspace, or a user, stored encrypted, and governed by platform policy. MVP routing is proxy-only even for BYOK.

## Consequences

- The extension never receives a long-lived raw provider key.
- Credential actions must emit audit and security logs.
- BYOK is enabled only where both entitlement and admin policy allow it.
