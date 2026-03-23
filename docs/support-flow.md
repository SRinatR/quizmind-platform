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

## Connected runtime status

`POST /support/impersonation` now has a Prisma-backed connected path:

1. verify `support:impersonate` permission from the current bearer session;
2. create a `SupportImpersonationSession` row in PostgreSQL;
3. persist both an `AuditLog` and a `SecurityEvent` in the same transaction;
4. keep the existing mock fallback for local foundation mode without bearer auth.

`POST /support/impersonation/end` now also has a Prisma-backed connected path:

1. verify `support:impersonate` permission from the current bearer session;
2. resolve the active impersonation session;
3. set `endedAt` on the persisted session;
4. persist both a termination `AuditLog` and a termination `SecurityEvent`.

`GET /support/tickets` now resolves recent open or in-progress support tickets, and connected support sessions can start impersonation with persisted `supportTicketId` and `operatorNote` context.

`GET /support/impersonation-sessions` now also resolves recent persisted sessions for support-capable callers, `/admin/support` renders that history together with the live ticket queue and active-session termination controls, and `/admin/users` can still start a persisted support session directly from the connected web UI.

## Intended next path

1. add retention policies and automatic stale-session cleanup;
2. add actor/target search and guardrails around workspace-scoped impersonation;
3. surface richer operator context and editable launch/close reasons in the web admin tools;
4. add explicit ticket ownership, ticket state transitions, and operator handoff metadata.
