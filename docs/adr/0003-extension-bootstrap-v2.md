# ADR 0003: Extension Installation Auth And Bootstrap V2

- Status: accepted
- Date: 2026-03-24

## Decision

Extension bootstrap v2 is installation-authenticated. The user session is only used to bind the installation. Ongoing bootstrap refresh and telemetry use a short-lived installation token.

## Consequences

- Caller-supplied `userId` and `planCode` are no longer trusted in v2 flows.
- Existing bootstrap v1 stays alive during migration.
- Extension installations become managed clients of the control plane.
