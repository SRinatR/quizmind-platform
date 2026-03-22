# QuizMind Platform

Monorepo scaffold for the QuizMind control-plane platform.

## Target architecture

- `apps/web` — one Next.js application for the landing site, user dashboard, auth flows, and admin panel.
- `apps/api` — NestJS backend for auth, billing, RBAC, feature flags, remote config, extension compatibility, and admin APIs.
- `apps/worker` — BullMQ workers and scheduled jobs for webhooks, billing, notifications, quota resets, and config propagation.
- `packages/*` — shared contracts and domain libraries used across the platform.

## Product modules planned from day one

- Auth, sessions, MFA, and workspace membership.
- Flexible billing, subscriptions, entitlements, add-ons, and overrides.
- RBAC + ABAC + entitlement-aware access control.
- Feature flags, remote config, and extension compatibility policies.
- Full audit, activity, domain, telemetry, and system logging.

## Workspace commands

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build
```

## Structure

```text
apps/
  web/
  api/
  worker/
packages/
  ui/
  config/
  contracts/
  auth/
  billing/
  extension/
  logger/
  database/
  permissions/
docs/
  architecture.md
```
