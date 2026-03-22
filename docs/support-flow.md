# Support Flow

The repo now includes the first support/impersonation workflow primitives.

## Contracts

- `SupportImpersonationRequest`
- `SupportImpersonationResult`

## API service

`apps/api/src/services/support-service.ts` models the beginning of a support impersonation session and emits both:

- an audit log event;
- a security log event.

This reflects the requirement that sensitive support actions must be logged in more than one stream.

## Intended future path

1. verify `support:impersonate` permission;
2. create an impersonation session row in PostgreSQL;
3. emit audit + security logs;
4. expose the session in admin/support tooling;
5. require explicit termination and retention policies.
