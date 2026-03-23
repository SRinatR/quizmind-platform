# Foundation Roadmap

## Current state

The monorepo foundation is largely in place already: contracts, permissions, billing helpers, logging, extension contracts, configuration, and the Prisma schema exist in the repo. The main delivery risk is no longer package creation, but the gap between the current mock-backed service layer and a real PostgreSQL + Prisma-backed control plane.

## Near-term priorities

1. **Real auth backend before broader product work.** Registration, login, email verification, session lifecycle, and password reset must land before dashboard work expands.
2. **Explicit mock-to-real migration.** `apps/api/src/platform.service.ts` currently composes hardcoded flows from `apps/api/src/platform-data.ts`; replacing that with repositories is a first-class milestone, not cleanup.
3. **Design-system decision before feature-heavy frontend work.** `packages/ui` is still effectively empty, while `apps/web` uses app-local styling. We should either build shared UI primitives and tokens first or intentionally keep UI ownership inside each app.
4. **Scope MFA honestly.** The database schema already models MFA, but runtime auth code does not. Treat MFA as either an explicit post-auth sprint or remove it from the MVP promise.
5. **Add tests before billing and permissions deepen.** Access resolution, entitlement logic, semver compatibility, and billing state transitions need automated coverage before the real integrations arrive.

## Sprint order

### Sprint 1–2 — foundation hardening

- Keep the existing monorepo, contracts, Prisma schema, mock API, and CI baseline.
- Stabilize environment loading and local Docker runtime.
- Document current mock boundaries so the next sprint can replace them intentionally.

### Sprint 3 — real auth backend

- Build registration and login against Prisma-backed user/account/session tables.
- Add **email verification** as a required path before dashboard access.
- Support session refresh, logout, password reset hooks, and audit/security events.
- Decide MFA scope for MVP:
  - either defer it explicitly after core auth is stable;
  - or implement TOTP / recovery-code support against the existing schema.

### Sprint 4 — workspace identity, roles, and repositories

- Introduce a repository layer in `apps/api` (`UserRepository`, `WorkspaceRepository`, `SubscriptionRepository`, and related services).
- Move auth, workspace membership, and permissions reads from mock data to Prisma.
- Persist workspace roles and access decisions against real data.
- Keep service interfaces stable while swapping repository implementations underneath.

### Sprint 5 — billing provider integration

- Implement provider-backed checkout, customer sync, and webhook ingestion.
- Model subscription lifecycle transitions and retries explicitly.
- Plan this as the highest-risk integration sprint with extra buffer.

### Sprint 6 — entitlements and quota engine on real data

- Resolve plan entitlements, overrides, and quota counters from PostgreSQL.
- Connect usage-event ingestion to real counter updates and billing decisions.
- Verify extension-facing access checks against persisted subscription state.

### Sprint 7 — shared UI foundation

- Either build `packages/ui` into a real design system (tokens, primitives, shared patterns, likely shadcn/ui-based) or explicitly decide that apps own their own UI.
- Align `apps/web` styling with that decision before feature screens multiply.

### Sprint 8 — auth UI and dashboard UX

- Ship registration, login, email verification, password reset, and session UX.
- Build the first real workspace dashboard screens on top of the chosen UI foundation.

### Sprint 9 — feature flags and remote-config operations

- Add admin UX and API workflows for flag management, config versioning, preview, and publish.
- Persist publish history, audit trails, and rollout metadata in the real backend.

### Sprint 10 — extension integration with live platform data

- Replace mock bootstrap assumptions with real installation, entitlement, and compatibility checks.
- Connect the extension control plane to persisted users, workspaces, and config.

### Sprint 11 — admin operations

- Build users, workspaces, subscriptions, logs, and support tooling for operators.
- Add queue/job inspection surfaces where operationally necessary.

### Sprint 12 — hardening and security review

- Close production-readiness gaps: rate limits, secrets handling, failure drills, observability, and incident tooling.
- Run a focused security review for auth, billing, impersonation, and extension flows.
- Expand integration and end-to-end coverage around the highest-risk workflows.

## Cross-cutting packages to add early

### `packages/email`

Add in the first auth sprint, not later. The package should own templates and a provider-neutral contract so `apps/api` can choose the concrete transport.

```ts
interface EmailAdapter {
  send(template: EmailTemplate, to: string, vars: Record<string, unknown>): Promise<void>;
}
```

Recommended provider adapters to support over time: Resend, Postmark, and SES.

### `packages/queue`

BullMQ is already part of the worker architecture, but queue helpers should not live only inside runtime apps. A dedicated package should expose queue names, payload contracts, enqueue helpers, idempotency utilities, and retry defaults so `apps/api` and `apps/worker` can share the same integration boundary.

## Required testing baseline

Before the platform moves past mock-backed foundations, add at least:

- unit tests for `evaluateAccess`;
- unit tests for `resolveEntitlements`;
- unit tests for `compareSemver` and compatibility evaluation;
- billing state-machine tests for subscription lifecycle changes;
- repository integration tests for the auth + membership path;
- webhook and queue-handler contract tests where provider integrations exist.
