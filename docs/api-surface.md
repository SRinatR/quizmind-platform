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
- `GET /support/impersonation-sessions`
- `GET /support/tickets`
- `POST /support/tickets/update`
- `POST /support/impersonation`
- `POST /support/impersonation/end`

## Why this matters

These routes now cover the minimum platform loop plus the first support-ops workflow:

1. authenticate a user;
2. load their workspace and subscription state;
3. resolve extension bootstrap state;
4. ingest usage back into the platform;
5. allow admins to operate flags and remote config;
6. let support operators manage ticket workflow and controlled impersonation.

## Shared contracts already available

The contracts package now defines:

- auth login payloads;
- session payloads;
- workspace summaries;
- subscription summaries;
- extension bootstrap request/response shapes;
- usage event payloads;
- support ticket queue and workflow update shapes;
- support impersonation request/response/history shapes, including persisted close reasons for ended sessions;
- route metadata definitions.
