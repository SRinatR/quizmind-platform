# Service Composition Notes

The repo now contains a first pass at app-layer service helpers that compose the shared packages.

## API service examples

- `apps/api/src/services/access-service.ts` shows how a session principal can be converted into an access context and evaluated against permission + entitlement requirements.
- `apps/api/src/services/extension-bootstrap-service.ts` shows how an extension bootstrap response can be assembled from compatibility policy, feature flags, and remote-config layers.

## Worker service example

- `apps/worker/src/jobs/process-usage-event.ts` shows how billing quota helpers and logger primitives can be combined to accept or reject extension usage events.

These files are intentionally framework-agnostic so they can be reused later inside NestJS services, queue processors, and controller handlers.
