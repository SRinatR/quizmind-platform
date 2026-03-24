# ADR 0001: Platform Source Of Truth

- Status: accepted
- Date: 2026-03-24

## Decision

Platform backend plus database is the only source of truth for auth, workspaces, billing, entitlements, quotas, compatibility, AI access policy, and admin overrides.

## Consequences

- Extension may cache last-known config and UI preferences only.
- Frontend must treat API responses as authoritative.
- Local storage cannot be the source of truth for access, billing, or provider policy.
