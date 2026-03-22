# Foundation Roadmap

## Phase 1 — platform bootstrap

- Wire real package managers and CI.
- Replace placeholder app scripts with Next.js, NestJS, Prisma, and BullMQ setup.
- Add `.env.example` files for web, api, and worker.

## Phase 2 — identity and access

- Build auth sessions, MFA, and workspace membership.
- Persist roles, permissions, and membership state in PostgreSQL.
- Add audit logging to every access-changing action.

## Phase 3 — billing and entitlements

- Implement plans, prices, subscriptions, add-ons, and overrides.
- Connect webhook ingestion and job retries.
- Resolve entitlements for both the dashboard and extension.

## Phase 4 — extension control plane

- Add extension linking and installation records.
- Resolve feature flags and remote config.
- Enforce compatibility policy by version and capability.
