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

`GET /support/tickets` now resolves Prisma-backed support tickets with queue filters and named presets for status, ownership, search, and timeline depth, including persisted ownership, handoff metadata, and recent workflow timeline entries, and connected support sessions can start impersonation with persisted `supportTicketId` and `operatorNote` context.

`POST /support/tickets/update` now lets connected support-capable callers claim tickets, change workflow status, save operator handoff notes in Prisma-backed rows, and persist an `AuditLog` event that feeds the recent ticket workflow timeline.

`POST /support/impersonation/end` now also accepts an optional persisted `closeReason`, stores it on the Prisma-backed session row, and includes it in termination audit/security metadata.

`GET /support/impersonation-sessions` now also resolves recent persisted sessions for support-capable callers, `/admin/support` renders that history together with the live ticket queue and active-session termination controls, and `/admin/users` can still start a persisted support session directly from the connected web UI.

`/admin/users` now lets operators launch a support session with editable session reason and operator note instead of relying on a fixed template.

`/admin/support` now lets operators claim ticket ownership, return tickets to the shared queue, move them through `open -> in_progress -> resolved/closed`, review recent workflow history beside each ticket, apply URL-backed filters for queue scope, ownership, search, and history depth, jump between one-click named queue presets, save personal favorite presets that float to the front of the operator console, keep editable handoff notes beside the ticket-linked impersonation flow, launch ticket-linked sessions with editable session reason/operator note, and finish active impersonation sessions with an operator close reason.

## Intended next path

1. add retention policies and automatic stale-session cleanup;
2. add actor/target search and guardrails around workspace-scoped impersonation;
3. add multi-operator assignment and explicit longer-range ownership history for support tickets.
4. add longer operator timelines, saved filter bundles, and richer ticket handoff summaries in the web admin tools.
