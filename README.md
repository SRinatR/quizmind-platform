# QuizMind Platform

Monorepo foundation for the QuizMind control-plane platform.

## Target architecture

- `apps/web` — one Next.js application for the landing site, auth flows, user dashboard, and admin panel.
- `apps/api` — NestJS backend for auth, billing, RBAC, feature flags, remote config, extension compatibility, and admin APIs.
- `apps/worker` — BullMQ workers and scheduled jobs for webhooks, billing, notifications, quota resets, and config propagation.
- `packages/*` — shared contracts and domain libraries used across the platform.

## Product modules planned from day one

- Auth, sessions, MFA, and workspace membership.
- Flexible billing, subscriptions, entitlements, add-ons, and overrides.
- RBAC + ABAC + entitlement-aware access control.
- Feature flags, remote config, and extension compatibility policies.
- Full audit, activity, domain, telemetry, and system logging.

## Shared packages

- `contracts` — role, entitlement, billing, compatibility, and audit contracts.
- `permissions` — permission registry plus system/workspace role resolution.
- `auth` — session principal and access-context helpers.
- `billing` — subscription status guards and entitlement resolution helpers.
- `extension` — version and capability compatibility evaluation.
- `logger` — structured log event helpers and secret redaction.
- `config` — env-loading helpers for web, API, and workers.
- `ui` — shared navigation and future design-system primitives.
- `database` — schema group ownership and Prisma home.

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
  foundation-roadmap.md
```
