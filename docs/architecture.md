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
Session helpers, permission decorators, guard helpers, token utilities, and security-oriented policies.

### `packages/billing`
Subscription states, entitlement resolution, quota helpers, plan metadata, and billing policy helpers.

### `packages/extension`
Extension handshake contracts, capability negotiation helpers, remote-config payload types, and sync clients.

### `packages/permissions`
Permission registry, role presets, ABAC predicates, and entitlement-aware access helpers.

### `packages/logger`
Unified event names, log builders, redaction helpers, and transport-safe logging primitives.

### `packages/database`
Prisma schema, migrations, seed data, and database access helpers.

### `packages/ui`
Shared React components, design tokens, and admin/dashboard UI primitives.

### `packages/config`
Environment schema validation, shared constants, and config-loading helpers.

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

1. Foundation: monorepo, CI, config, shared contracts.
2. Identity: auth, sessions, workspaces, RBAC base.
3. Billing: subscriptions, entitlements, quota counters, webhooks.
4. Control plane: flags, remote config, compatibility engine.
5. Admin tools: audit explorer, support tools, jobs, and webhook management.
6. Growth modules: analytics, partner flows, advanced experimentation.
