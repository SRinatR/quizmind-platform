# QuizMind Platform

Monorepo foundation for the QuizMind control-plane platform.

## Target Architecture

- `apps/web` - one Next.js application for the landing site, auth flows, user dashboard, and admin panel.
- `apps/api` - NestJS backend for auth, billing, RBAC, feature flags, remote config, extension compatibility, and admin APIs.
- `apps/worker` - BullMQ workers and scheduled jobs for webhooks, billing, notifications, quota resets, and config propagation.
- `packages/*` - shared contracts and domain libraries used across the platform.

## Product Modules Planned From Day One

- Auth, sessions, email verification, and workspace membership.
- MFA is modeled in the schema but remains a planned post-auth hardening milestone unless explicitly pulled into MVP.
- Flexible billing, subscriptions, entitlements, add-ons, and overrides.
- RBAC + ABAC + entitlement-aware access control.
- Feature flags, remote config, and extension compatibility policies.
- Full audit, activity, domain, telemetry, and system logging.

## Shared Packages

- `contracts` - role, entitlement, billing, compatibility, and audit contracts.
- `permissions` - permission registry plus system/workspace role resolution.
- `auth` - session principal helpers plus password and token utilities for real auth flows.
- `billing` - subscription status guards and entitlement resolution helpers.
- `extension` - version and capability compatibility evaluation.
- `logger` - structured log event helpers and secret redaction.
- `config` - env-loading helpers for web, API, and workers.
- `ui` - shared navigation today, with design-system primitives planned before major dashboard/admin buildout.
- `database` - Prisma schema, migrations, seed data, and generated client boundary.
- `email` - provider-neutral email templates and adapters for auth notifications.
- `queue` - BullMQ integration helpers shared by API and worker.

## Environment Examples

- `apps/api/.env.example`
- `apps/web/.env.example`
- `apps/worker/.env.example`

## Workspace Commands

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Local Runtime

- `pnpm dev` starts all three apps together.
- API runs on `http://localhost:4000`.
- Web prefers `http://localhost:3000` and automatically shifts to the next free port if `3000` is already occupied.
- Worker starts in `mock` mode by default so the monorepo boots even when PostgreSQL and Redis are not running yet.
- In `connected` mode, auth now has a real Prisma-backed foundation for register, login, refresh, logout, `/auth/me`, and email verification.
- `GET /workspaces` and `GET /billing/subscription` now also resolve from Prisma-backed repositories when a bearer session is present.
- `GET /admin/users` now also resolves from Prisma-backed repositories when a bearer session is present.
- `GET /admin/feature-flags` now also resolves from Prisma-backed repositories when a bearer session is present.
- `POST /admin/remote-config/publish` now persists Prisma-backed versions and layers when a bearer session is present.
- `POST /extension/bootstrap` now resolves persisted compatibility policy, feature flags, active remote config layers, and workspace subscription plan in connected mode.
- `GET /support/impersonation-sessions` now returns recent Prisma-backed impersonation history for support-capable sessions.
- `GET /support/tickets` now returns recent Prisma-backed support tickets for support-capable sessions.
- `POST /support/impersonation` now persists Prisma-backed impersonation sessions plus audit and security events when a bearer session is present.
- `POST /support/impersonation/end` now closes active Prisma-backed impersonation sessions and persists termination audit and security events.
- `/admin/users` now renders a connected user directory for admin/support-capable sessions.
- `/admin/users` can now start persisted support impersonation sessions directly from the web UI for connected support-capable sessions.
- `/admin/support` now renders a live support queue, starts ticket-linked impersonation sessions, and can end active sessions in the web admin surface for connected support-capable sessions.

## Database Setup

```bash
corepack pnpm --filter @quizmind/database db:migrate:dev
corepack pnpm --filter @quizmind/database db:seed
```

After migrating and seeding the database, the default demo auth credentials are:

- `admin@quizmind.dev` / `demo-password`
- `support@quizmind.dev` / `demo-password`
- `viewer@quizmind.dev` / `demo-password`

## Docker Runtime

- `docker compose up --build` starts `postgres`, `redis`, `api`, `web`, and `worker`.
- On container startup, the API applies Prisma migrations and seeds demo data automatically; the worker also waits for the API to become healthy before starting.
- Docker defaults:
  API on `http://localhost:4000`
  Web on `http://localhost:3000`
  PostgreSQL on `localhost:5432`
  Redis on `localhost:6379`
- Custom host ports can be provided through `.env.docker` based on `.env.docker.example`.
- Full Docker runbook: `docs/docker-guide.md`

## Demo Personas

- `platform-admin` - full dashboard + admin visibility.
- `support-admin` - support workflows plus limited admin visibility.
- `workspace-viewer` - dashboard-only experience with admin denial state.

Use these via query params such as `/app?persona=platform-admin` and `/admin?persona=workspace-viewer`.

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
  email/
  queue/
docs/
  architecture.md
  foundation-roadmap.md
  control-plane-primitives.md
  data-model.md
  api-surface.md
  service-composition.md
  remote-config-flow.md
  billing-flow.md
  web-app-flow.md
  support-flow.md
```
