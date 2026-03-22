# Billing Flow

The repo now contains the first service composition path for subscriptions and quota maintenance.

## API layer

- `resolveWorkspaceSubscriptionSummary` composes a workspace subscription summary from plan metadata, subscription state, and entitlement overrides.
- The service uses the shared `@quizmind/billing` package so the summary format is consistent for dashboard pages, admin tools, and extension-aware access checks.

## Worker layer

- `resetQuotaCounter` models a quota-period rollover and emits a domain log event describing the reset.

## Intended future path

1. read plan + subscription + overrides from PostgreSQL;
2. resolve a subscription summary for the dashboard and admin views;
3. reset quota periods through scheduled worker jobs;
4. feed the resulting entitlement/quota state into extension bootstrap and usage enforcement.
