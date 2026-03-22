# Initial API Surface

The repo now includes the first explicit API contract layer for the future NestJS backend.

## Core routes

- `POST /auth/login`
- `GET /auth/me`
- `GET /workspaces`
- `GET /billing/subscription`
- `POST /extension/bootstrap`
- `POST /extension/usage-events`
- `GET /admin/feature-flags`
- `POST /admin/remote-config/publish`

## Why this matters

These routes cover the minimum platform loop:

1. authenticate a user;
2. load their workspace and subscription state;
3. resolve extension bootstrap state;
4. ingest usage back into the platform;
5. allow admins to operate flags and remote config.

## Shared contracts already available

The contracts package now defines:

- auth login payloads;
- session payloads;
- workspace summaries;
- subscription summaries;
- extension bootstrap request/response shapes;
- usage event payloads;
- route metadata definitions.
