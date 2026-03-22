# Control Plane Primitives

This document explains the first shared runtime primitives already present in the repo.

## Access evaluation

`packages/permissions` now supports:

- permission resolution from system + workspace roles;
- entitlement requirements;
- feature-flag requirements;
- workspace ownership checks.

The intended backend pattern is:

1. build an `AccessContext` from the authenticated principal;
2. describe the action as an `AccessRequirement`;
3. call `evaluateAccess` before service execution.

## Billing and quota checks

`packages/billing` now supports:

- active-subscription checks;
- plan entitlement resolution with overrides;
- quota consumption checks and counter increments.

The intended worker/API pattern is to resolve entitlements once per request and then guard operations such as screenshot usage or premium-model access.

## Extension control plane

`packages/extension` now supports:

- version compatibility evaluation;
- feature-flag resolution for a user/workspace/plan/version context;
- remote-config layer resolution by context.

That gives the platform a minimal control-plane core for the extension even before the real NestJS modules are wired.
