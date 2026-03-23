# QuizMind Platform Architecture

## Monorepo decision

The platform starts as a single monorepo with three runtime applications:

- `apps/web`: one Next.js app with route zones for landing, auth, dashboard, and admin.
- `apps/api`: one NestJS backend for all control-plane APIs.
- `apps/worker`: one worker process for asynchronous jobs, queue consumers, and scheduled tasks.

This structure balances fast delivery with clean boundaries. It avoids the overhead of multiple frontend repos while still separating synchronous API traffic from background processing.

## Package responsibilities

### `packages/contracts`
Shared DTOs, schema contracts, event payloads, config shapes, and compatibility contracts.

### `packages/auth`
Session helpers, guard helpers, token utilities, password/auth policies, and eventually MFA primitives once MFA is in active scope.

### `packages/billing`
Subscription states, entitlement resolution, quota helpers, plan metadata, and billing policy helpers.

### `packages/email`
Provider-neutral email contracts, template definitions, rendering helpers, and adapters for providers such as Resend, Postmark, or SES.

### `packages/extension`
Extension handshake contracts, capability negotiation helpers, remote-config payload types, and sync clients.

### `packages/permissions`
Permission registry, role presets, ABAC predicates, and entitlement-aware access helpers.

### `packages/logger`
Unified event names, log builders, redaction helpers, and transport-safe logging primitives.

### `packages/database`
Prisma schema, migrations, seed data, and database access helpers.

### `packages/queue`
Queue names, payload helpers, enqueue/dequeue utilities, retry defaults, and app/worker integration primitives around BullMQ.

### `packages/ui`
Shared React components, design tokens, and admin/dashboard UI primitives.

### `packages/config`
Environment schema validation, shared constants, and config-loading helpers.

## Implementation constraints we should design around

- The current API service layer is still mock-backed through `apps/api/src/platform-data.ts`; moving to real persistence should happen through repositories rather than direct service rewrites.
- `packages/ui` is not yet a real design system, so frontend delivery should sequence UI foundation before many app screens are built.
- The Prisma schema already models MFA-related tables, but runtime auth code does not yet expose MFA flows.
- Queue boundaries should be package-level contracts so the API can enqueue work without coupling to worker internals.

## Repository-first backend shape

The API should move toward a clear layering model:

1. **Controllers** translate transport contracts to application calls.
2. **Services** coordinate business workflows and policies.
3. **Repositories** isolate persistence concerns (`UserRepository`, `WorkspaceRepository`, `SubscriptionRepository`, `FeatureFlagRepository`, and similar).
4. **Packages** provide reusable domain logic shared across API, worker, and web.

That lets us replace mock data with Prisma-backed implementations without rewriting every business-facing service method.

## Access model

The authorization model will combine four layers:

1. **RBAC** for system roles and workspace roles.
2. **ABAC** for ownership, scope, region, environment, and risk-aware checks.
3. **Entitlements** for plan-derived access and limits.
4. **Feature flags** for rollout, beta access, and operational overrides.

### Example system roles

- `super_admin`
- `platform_admin`
- `billing_admin`
- `support_admin`
- `security_admin`
- `ops_admin`
- `content_admin`

### Example workspace roles

- `workspace_owner`
- `workspace_admin`
- `workspace_billing_manager`
- `workspace_security_manager`
- `workspace_manager`
- `workspace_analyst`
- `workspace_member`
- `workspace_viewer`

## Billing model

Billing is modeled through composable layers rather than a single flat plan:

- `plans`
- `plan_prices`
- `subscriptions`
- `subscription_items`
- `add_ons`
- `entitlements`
- `entitlement_overrides`
- `quota_counters`

That allows monthly or yearly billing, add-ons, trial flows, admin overrides, and grandfathered pricing without reworking the permission model.

## Logging strategy

The platform will log separate but linked event streams:

- audit logs;
- user activity logs;
- business domain events;
- system and infrastructure logs;
- security events;
- extension telemetry.

Every event should carry correlation metadata such as request ID, trace ID, actor, workspace, session, client version, and severity.

## Extension control plane

The extension becomes a managed client of the platform. The backend will provide:

- authenticated extension linking;
- feature flag resolution;
- remote config resolution;
- version compatibility status;
- entitlement-aware model availability;
- telemetry ingestion.

Compatibility decisions must consider extension version, supported capabilities, config schema version, and rollout policies.

## Recommended implementation order

1. Preserve the existing monorepo/package foundation.
2. Ship real auth with email verification and session persistence.
3. Introduce repositories and migrate mock-backed services to Prisma-backed data.
4. Integrate billing providers and webhook processing.
5. Connect entitlements, quotas, flags, and remote config to real data.
6. Build the shared UI foundation before broad dashboard/admin expansion.
7. Add admin operations, support tooling, and production hardening.
