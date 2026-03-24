# ADR 0005: Config, Flag, Compatibility, And Policy Resolution

- Status: accepted
- Date: 2026-03-24

## Decision

Extension payload resolution order is fixed:

1. installation auth and binding
2. compatibility
3. entitlements
4. feature flags
5. remote config layering
6. AI access policy
7. quota hints and kill switches
8. final payload

## Consequences

- Compatibility gates everything else.
- Flags do not bypass entitlement or compatibility denial.
- Remote config is applied after flags and entitlement resolution, never before.
