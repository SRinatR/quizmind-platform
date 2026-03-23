# QuizMind Platform

Monorepo foundation for the QuizMind control-plane platform.

## Target architecture

- `apps/web` — one Next.js application for the landing site, auth flows, user dashboard, and admin panel.
- `apps/api` — NestJS backend for auth, billing, RBAC, feature flags, remote config, extension compatibility, and admin APIs.
- `apps/worker` — BullMQ workers and scheduled jobs for webhooks, billing, notifications, quota resets, and config propagation.
- `packages/*` — shared contracts and domain libraries used across the platform.

## Product modules planned from day one

- Auth, sessions, email verification, and workspace membership.
- MFA is modeled in the schema but remains a planned post-auth hardening milestone unless explicitly pulled into MVP.
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
- `ui` — shared navigation today, with design-system primitives planned before major dashboard/admin buildout.
- `database` — schema group ownership and Prisma home.
- `email` — planned provider-neutral email templates and adapters for auth notifications.
- `queue` — planned BullMQ integration helpers shared by API and worker.

## Environment examples

- `apps/api/.env.example`
- `apps/web/.env.example`
- `apps/worker/.env.example`

## Workspace commands

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
```

## Local runtime

- `pnpm dev` starts all three apps together.
- API runs on `http://localhost:4000`.
- Web prefers `http://localhost:3000` and automatically shifts to the next free port if `3000` is already occupied.
- Worker starts in `mock` mode by default so the monorepo boots even when PostgreSQL and Redis are not running yet.
- The next major backend milestone is replacing mock-backed API service data with Prisma-backed repositories.

## Docker runtime

- `docker compose up --build` starts `postgres`, `redis`, `api`, `web`, and `worker`.
- Docker defaults:
  API on `http://localhost:4000`
  Web on `http://localhost:3000`
  PostgreSQL on `localhost:5432`
  Redis on `localhost:6379`
- Custom host ports can be provided through `.env.docker` based on `.env.docker.example`.
- Full Docker runbook: `docs/docker-guide.md`

## Demo personas

- `platform-admin` â€” full dashboard + admin visibility.
- `support-admin` â€” support workflows plus limited admin visibility.
- `workspace-viewer` â€” dashboard-only experience with admin denial state.

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
