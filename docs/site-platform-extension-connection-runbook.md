# Site, Platform, And Extension Connection Runbook

## Purpose

This document is the operational plan for connecting three product surfaces into one managed system:

- `apps/web` as the public site and authenticated app shell
- `apps/api` + `apps/worker` + PostgreSQL + Redis as the platform control plane
- the browser extension as a managed client of the platform

The target rule is simple:

- the platform is the source of truth
- the web app is the human control surface
- the extension is an authenticated managed client

## What Already Exists In This Repo

The current repo already has the core control-plane endpoints:

- `POST /auth/login`
- `GET /auth/me`
- `GET /workspaces`
- `GET /billing/subscription`
- `GET /extension/installations`
- `POST /extension/installations/bind`
- `POST /extension/installations/disconnect`
- `POST /extension/installations/rotate-session`
- `POST /extension/bootstrap/v2`
- `POST /extension/usage-events/v2`

The implementation lives in:

- `apps/api/src/extension/extension-control.controller.ts`
- `apps/api/src/extension/extension-control.service.ts`
- `packages/contracts/src/index.ts`

The current web app already stores authenticated platform sessions in HttpOnly cookies:

- `apps/web/src/lib/auth-session.ts`

That means the browser site can securely call the API with the current user session, but the extension cannot read those cookies directly.

## Important Current Gap

The missing piece for a clean end-to-end extension connection is a **web-to-extension auth bridge**.

Today:

- the API can bind an installation if it receives a bearer user session
- the web app has that session in HttpOnly cookies
- the extension does not have a safe way yet to receive a bind result without exposing the raw user access token

Recommended solution:

- implement a web bridge page and/or proxy route in `apps/web`
- the web bridge reads the current cookie session server-side
- the web bridge calls `POST /extension/installations/bind`
- the web bridge returns only the short-lived installation token + bootstrap payload to the extension

Do not pass the raw user access token into the extension as the normal steady-state solution.

## Final Connection Model

### 1. User Auth

- User signs in on the site at `/auth/login`
- Web stores `quizmind_access_token` and `quizmind_refresh_token` as HttpOnly cookies
- Web becomes the trusted human-facing surface for account, billing, workspaces, usage, and settings

### 2. Extension Binding

- Extension creates or loads a persistent `installationId`
- Extension collects a `handshake`:
  - `extensionVersion`
  - `buildId`
  - `schemaVersion`
  - `capabilities`
  - `browser`
- Extension opens the web bridge flow
- Web bridge uses the current site session to call `POST /extension/installations/bind`
- API upserts the installation record and issues a short-lived installation session token

### 3. Extension Bootstrap

- Extension stores:
  - `installationId`
  - short-lived installation token
  - last known bootstrap payload
- Extension calls `POST /extension/bootstrap/v2`
- Platform returns:
  - compatibility verdict
  - entitlements
  - feature flags
  - remote config
  - quota hints
  - AI access policy
  - deprecation messages
  - kill switches

### 4. Ongoing Telemetry

- Extension sends usage and runtime events to `POST /extension/usage-events/v2`
- API enqueues usage work to the worker
- Worker updates counters and downstream logs

### 5. Re-auth / Rebind

- If installation token expires or is revoked, extension falls back to last known bootstrap
- Extension prompts the user to reconnect through the web bridge
- User session remains on the site; extension only regains a fresh installation token

## Local Development Algorithm

## Step 1. Start Platform Runtime

Preferred Docker flow:

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up --build -d
```

Verify:

```bash
docker compose ps
curl http://localhost:4000/health
curl http://localhost:4000/foundation
```

Expected local URLs:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Step 2. Seed And Sign In

If running through Docker, API startup already runs:

- Prisma migrate deploy
- database seed

Default local credentials:

- `admin@quizmind.dev` / `demo-password`
- `support@quizmind.dev` / `demo-password`
- `viewer@quizmind.dev` / `demo-password`

Open:

- `http://localhost:3000/auth/login`

Sign in there first. The site session is required for the bridge flow.

## Step 3. Extension Creates Installation Identity

The extension should generate and persist:

- `installationId`: UUID-like stable ID per installed extension

The extension should compute a `handshake` on startup:

```json
{
  "extensionVersion": "1.7.0",
  "buildId": "dev-local",
  "schemaVersion": "2",
  "capabilities": ["quiz-capture", "history-sync", "remote-sync"],
  "browser": "chrome"
}
```

The extension should also know:

- platform web URL: `http://localhost:3000`
- platform API URL: `http://localhost:4000`

## Step 4. Web Bridge Opens From Extension

Recommended extension action:

- open a web page such as:

```text
http://localhost:3000/app/extension/connect?installationId=<id>&browser=chrome&extensionVersion=1.7.0&schemaVersion=2&buildId=dev-local&targetOrigin=chrome-extension://<extension-id>&requestId=bind_123&bridgeNonce=<nonce>
```

Required for hardened bridge exchange:

- `targetOrigin`: strict receiver origin for `window.postMessage`
- `requestId`: correlation id for bind request/response pairing
- `bridgeNonce`: nonce echoed by the bridge in every outbound envelope

Current web bridge implementation:

- `apps/web/src/app/app/extension/connect/page.tsx`
- `apps/web/src/app/app/extension/connect/extension-connect-client.tsx`
- `apps/web/src/app/api/extension/bind/route.ts`
- `apps/web/src/app/api/extension/bind/redeem/route.ts`

Bridge page responsibilities:

1. Read current auth cookies server-side
2. Resolve the selected workspace
3. Build `ExtensionInstallationBindRequest`
4. Call `POST /extension/installations/bind`
5. Return only the bind result to the extension

Recommended response transport from web page to extension:

- `window.postMessage` to the opener window, or
- redirect to an extension callback URL if the extension platform supports it

Recommended payload returned from the bridge to the extension:

```json
{
  "installation": {
    "installationId": "inst_123",
    "workspaceId": "ws_123",
    "userId": "user_123",
    "browser": "chrome",
    "extensionVersion": "1.7.0",
    "buildId": "dev-local",
    "schemaVersion": "2",
    "capabilities": ["quiz-capture", "history-sync", "remote-sync"],
    "lastSeenAt": "2026-03-25T10:00:00.000Z",
    "boundAt": "2026-03-25T10:00:00.000Z"
  },
  "session": {
    "token": "<installation_token>",
    "expiresAt": "2026-03-25T11:00:00.000Z",
    "refreshAfterSeconds": 900
  },
  "bootstrap": {
    "...": "initial managed-client payload"
  }
}
```

One-time bind code fallback (when `postMessage` handoff fails):

- bridge now returns `fallbackCode` with short TTL and redeem path
- extension can redeem once through:
- current implementation stores fallback codes in web-process memory; use a shared store for multi-instance production runtime

```http
POST /api/extension/bind/redeem
Content-Type: application/json
```

```json
{
  "code": "<fallback_code>",
  "installationId": "inst_123",
  "requestId": "bind_123",
  "bridgeNonce": "<nonce>"
}
```

## Step 5. Extension Stores Only Managed-Client State

The extension may store:

- `installationId`
- installation session token
- token expiry timestamp
- last known bootstrap payload
- non-sensitive UI preferences

The extension must not become the source of truth for:

- plan
- entitlements
- compatibility
- feature availability
- quotas
- AI provider policy
- billing state

## Step 6. Extension Refreshes Bootstrap

Extension request:

```http
POST /extension/bootstrap/v2
Authorization: Bearer <installation_token>
Content-Type: application/json
```

```json
{
  "installationId": "inst_123",
  "environment": "development",
  "handshake": {
    "extensionVersion": "1.7.0",
    "buildId": "dev-local",
    "schemaVersion": "2",
    "capabilities": ["quiz-capture", "history-sync", "remote-sync"],
    "browser": "chrome"
  }
}
```

Extension behavior:

1. call bootstrap on startup
2. refresh before `refreshAfterSeconds`
3. refresh after important version/capability changes
4. if the call fails, keep using the last known bootstrap until re-auth is required

## Step 7. Extension Sends Usage Events

Extension request:

```http
POST /extension/usage-events/v2
Authorization: Bearer <installation_token>
Content-Type: application/json
```

```json
{
  "installationId": "inst_123",
  "workspaceId": "ws_123",
  "eventType": "extension.quiz_answer_requested",
  "occurredAt": "2026-03-25T10:05:00.000Z",
  "payload": {
    "questionType": "multiple_choice",
    "surface": "content_script",
    "answerMode": "instant"
  }
}
```

The extension should send at least:

- answer requests
- screenshot requests
- mult-check usage
- compatibility failures
- runtime errors
- reconnect / token-expired events

## Step 8. Site Dashboard Reads The Same Truth

The site should use the same backend records to render:

- subscription state
- usage summary
- extension installation inventory
- AI access mode
- compatibility warnings

Existing useful endpoints:

- `GET /workspaces`
- `GET /billing/subscription`
- `GET /usage/summary`
- `GET /extension/installations`
- `POST /extension/installations/disconnect`
- `POST /extension/installations/rotate-session`
- `GET /admin/installations`
- `GET /providers/credentials`
- `GET /admin/compatibility`
- `GET /admin/logs`
- `GET /admin/webhooks`

## Required Implementation Plan To Finish The Link

### Phase A. Runtime And Environment

1. Start Docker stack
2. Verify `web`, `api`, `worker`, `postgres`, and `redis`
3. Verify `/health` and `/foundation`

### Phase B. Web-To-Extension Auth Bridge

1. Open the implemented web page `app/app/extension/connect/page.tsx`
2. Use the implemented web proxy route `app/api/extension/bind/route.ts`
3. Read cookie session with `getAccessTokenFromCookies()`
4. Proxy bind request to the API
5. Return installation token to the extension through `window.postMessage`

This bridge is now the main integration entrypoint between the signed-in site session and the managed extension runtime.

### Phase C. Extension Runtime Wiring

1. Generate and persist `installationId`
2. Implement `connectToPlatform()`
3. Implement `refreshBootstrap()`
4. Implement `sendUsageEvent()`
5. Implement last-known-bootstrap fallback
6. Implement re-auth prompt when installation token expires

### Phase D. Dashboard And Settings

1. Show extension installation list in user dashboard
2. Show current compatibility state
3. Show AI access mode and credential policy
4. Show usage and quota warnings
5. Give operators a workspace-scoped extension fleet view in `/admin/extension-fleet`
6. Let operators inspect recent installation token history there so reconnect and revoke churn is diagnosable

### Phase E. Production Hardening

1. Enforce bridge nonce and origin validation (`targetOrigin` + `bridgeNonce`, no `*` fallback)
2. Add one-time bind code fallback (`/api/extension/bind/redeem`) if `postMessage` is not enough
3. Add token rotation and revocation UX (`POST /extension/installations/rotate-session` + dashboard controls)
4. Add installation disconnect flow
5. Add audit events for bind, refresh failure, revoke, reconnect (persisted to audit/security/domain streams)

## Recommended Extension Modules

Recommended implementation split in the extension codebase:

- `platform-auth.ts`
  - open bridge page
  - receive bind result
  - persist installation token
- `platform-bootstrap.ts`
  - call bootstrap v2
  - cache last known payload
  - schedule refresh
- `platform-telemetry.ts`
  - queue usage/runtime events
  - retry lightweight telemetry
- `platform-state.ts`
  - installation id
  - token expiry
  - current workspace binding
  - bootstrap cache
- `platform-ui.ts`
  - show reconnect prompt
  - show compatibility/deprecation warnings
  - show backend-unavailable fallback

## Security Rules

- Do not expose the raw site access token to the extension as the steady-state integration model
- Do not let the extension decide billing, entitlements, or AI policy locally
- Do not store raw BYOK provider keys in the extension
- Do not trust caller-supplied `userId` or `planCode` in extension v2 flows
- Always prefer short-lived installation session tokens for extension runtime calls

## Definition Of Done

The site, platform, and extension are considered properly connected when all of the following are true:

1. User can sign in on the site
2. Extension can open the web bridge and bind itself to the signed-in user
3. Extension receives a short-lived installation token, not a raw user bearer token
4. Extension can call `/extension/bootstrap/v2`
5. Extension can call `/extension/usage-events/v2`
6. Site dashboard reflects the same workspace, usage, and installation state
7. If the token expires, extension falls back safely and prompts reconnect
8. Admin can inspect compatibility, logs, and webhook/job state from the control plane

## Immediate Next Files To Implement

If you want to extend or harden the current browser binding flow next, start here:

- `apps/web/src/app/app/extension/connect/page.tsx`
- `apps/web/src/app/app/extension/connect/extension-connect-client.tsx`
- `apps/web/src/app/api/extension/bind/route.ts`
- extension-side `platform-auth.ts`
- extension-side `platform-bootstrap.ts`
- extension-side `platform-telemetry.ts`

This is the shortest path from the current repo state to a fully linked site + platform + extension flow.
