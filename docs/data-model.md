# Initial Data Model

The first Prisma schema is meant to support the platform architecture already defined in the repo.

## Included domains

- **Identity**: users, accounts, sessions, and system-role assignments.
- **Workspaces**: memberships and invitations.
- **Billing**: plans, prices, subscriptions, invoices, and payments.
- **Entitlements**: per-plan entitlements, workspace overrides, and quota counters.
- **Control plane**: feature flags, remote config versions/layers, and extension compatibility rules.
- **Extension**: installations and telemetry events.
- **Observability**: audit logs, activity logs, security events, and domain events.
- **Support**: support tickets tied to users and optionally workspaces.

## Design notes

- Enums mirror the shared contracts package so the future API layer can map DTOs and persistence more directly.
- `RemoteConfigLayer.conditionsJson` and `valuesJson` are stored as JSON to preserve flexibility while the merge rules are still evolving.
- `ExtensionInstallation` stores capability payloads and version information so compatibility and remote config can be resolved per installation.
- `QuotaCounter` is period-based so monthly, daily, and custom billing windows can be tracked without changing the table shape.
