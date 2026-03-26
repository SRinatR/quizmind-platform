# Extension Developer Integration Spec

## Purpose

This document is the handoff for the extension developer who will connect the browser extension to QuizMind Platform.

Goal:

- the platform backend becomes the source of truth
- the site becomes the human auth and control surface
- the extension becomes a managed client authenticated with a short-lived installation token

This file is intentionally implementation-focused so it can be used as a working spec.

## Non-Negotiable Rules

- Do not use the raw site user access token as the extension runtime auth model.
- Do not store raw BYOK provider keys in the extension.
- Do not trust local extension state as source of truth for billing, entitlements, feature flags, quotas, compatibility, or AI policy.
- Use only the platform-issued installation token for extension runtime calls.
- Treat the platform bootstrap payload as the current operational state.

## Current Local URLs

- Site: `http://localhost:3000`
- API: `http://localhost:4000`

Production and staging URLs must be injected through environment-specific configuration.

## What Already Exists In Platform

Available platform endpoints:

- `GET /extension/installations`
- `POST /extension/installations/bind`
- `POST /extension/installations/disconnect`
- `POST /extension/installations/rotate-session`
- `POST /extension/bootstrap/v2`
- `POST /extension/usage-events/v2`

Current implementation references:

- `apps/api/src/extension/extension-control.controller.ts`
- `apps/api/src/extension/extension-control.service.ts`
- `packages/contracts/src/index.ts`
- `packages/extension/src/index.ts`

Related web auth storage:

- `apps/web/src/lib/auth-session.ts`

The site already stores user auth in HttpOnly cookies:

- `quizmind_access_token`
- `quizmind_refresh_token`

The extension must not read those cookies directly.

## Architecture Summary

### Site responsibilities

- user login and session ownership
- workspace selection UX
- opening the extension connect bridge
- sending bind request to platform using the site session

### Platform responsibilities

- validate the signed-in user session
- bind `installationId` to `userId` and `workspaceId`
- issue a short-lived installation token
- return bootstrap v2 payload
- resolve compatibility, flags, config, entitlements, quota hints, and AI access policy
- ingest extension telemetry

### Extension responsibilities

- create and persist `installationId`
- open the connect bridge
- store installation token and last known bootstrap
- refresh bootstrap before token refresh deadline
- send usage/runtime telemetry
- fall back safely when backend is temporarily unavailable

## Required Inputs From The Extension

The extension must provide:

- `installationId`
- `environment`
- `handshake.extensionVersion`
- `handshake.buildId`
- `handshake.schemaVersion`
- `handshake.capabilities`
- `handshake.browser`

### Installation ID

Requirements:

- stable per installed extension
- generated once and persisted
- UUID-like random ID is recommended
- must survive browser restarts
- should be replaced only if the user fully reinstalls or local state is deliberately reset

Recommended format:

```text
inst_<uuid>
```

Example:

```text
inst_5b8e71a2-45f6-4c72-8b7f-2dfdfef4dc13
```

### Handshake Contract

Required shape:

```json
{
  "extensionVersion": "1.7.0",
  "buildId": "dev-local",
  "schemaVersion": "2",
  "capabilities": ["quiz-capture", "history-sync", "remote-sync"],
  "browser": "chrome"
}
```

Validation rules enforced by the platform:

- `extensionVersion` is required
- `schemaVersion` is required
- `capabilities` must contain at least one item
- `browser` must be one of `chrome | edge | brave | other`
- `buildId` is optional but strongly recommended

Recommended current capability set:

- `quiz-capture`
- `history-sync`
- `remote-sync`
- `screenshot-capture`
- `multi-check`
- `chat`

Only advertise capabilities that really exist in the extension runtime.

## Bind Flow

The bind flow exists because the extension cannot safely own the site session cookies.

### High-level algorithm

1. User signs in on the site.
2. Extension creates or loads `installationId`.
3. Extension opens a site bridge page.
4. Site bridge reads current HttpOnly session cookies server-side.
5. Site bridge calls `POST /extension/installations/bind`.
6. Platform returns installation session token plus bootstrap payload.
7. Site bridge returns only the bind result to the extension.
8. Extension stores managed-client state and starts bootstrap refresh logic.

### Recommended bridge URL

```text
http://localhost:3000/app/extension/connect?installationId=<id>&browser=chrome&extensionVersion=1.7.0&schemaVersion=2&buildId=dev-local&targetOrigin=chrome-extension://<extension-id>&requestId=bind_123&bridgeNonce=<nonce>
```

Required hardening query params:

- `targetOrigin`: exact extension origin that should receive `postMessage`
- `requestId`: caller correlation id for response matching
- `bridgeNonce`: single-use nonce echoed by the bridge in every message envelope

Recommended web files to build around this:

- `apps/web/src/app/app/extension/connect/page.tsx`
- `apps/web/src/app/app/extension/connect/extension-connect-client.tsx`
- `apps/web/src/app/api/extension/bind/route.ts`
- `apps/web/src/app/api/extension/bind/redeem/route.ts`

### Bind request

The web bridge calls:

```http
POST /extension/installations/bind
Authorization: Bearer <site_user_access_token>
Content-Type: application/json
```

```json
{
  "installationId": "inst_123",
  "workspaceId": "ws_123",
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

Important runtime rules:

- if `workspaceId` is omitted, the platform will currently fall back to the first workspace from the signed-in session
- the extension should still send explicit `workspaceId` when the UI allows the user to choose
- the extension never calls this endpoint directly with a raw site token in steady-state runtime

### Bind result

Expected response:

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
    "installationId": "inst_123",
    "workspaceId": "ws_123",
    "compatibility": {
      "status": "supported",
      "minimumVersion": "1.6.0",
      "recommendedVersion": "1.7.0",
      "supportedSchemaVersions": ["2"]
    },
    "entitlements": [],
    "featureFlags": [],
    "remoteConfig": {
      "values": {},
      "appliedLayerIds": []
    },
    "quotaHints": [],
    "aiAccessPolicy": {
      "mode": "platform_only",
      "allowPlatformManaged": true,
      "allowBringYourOwnKey": false,
      "allowDirectProviderMode": false,
      "providers": ["openrouter"],
      "defaultProvider": "openrouter"
    },
    "deprecationMessages": [],
    "killSwitches": [],
    "refreshAfterSeconds": 900,
    "issuedAt": "2026-03-25T10:00:00.000Z"
  }
}
```

### Bridge transport back to the extension

Recommended transport:

- `window.postMessage`

Recommended message envelope:

```json
{
  "type": "quizmind.extension.bind_result",
  "requestId": "bind_123",
  "payload": {
    "installation": {},
    "session": {},
    "bootstrap": {}
  }
}
```

Recommended error envelope:

```json
{
  "type": "quizmind.extension.bind_error",
  "requestId": "bind_123",
  "error": {
    "code": "bind_failed",
    "message": "User session is missing or expired."
  }
}
```

Bridge security requirements:

- validate `origin` on both sides
- include both `requestId` and `bridgeNonce`
- do not broadcast to `*` when a strict target origin is known
- close the bridge window after success or terminal failure

### One-time bind code fallback

If `window.postMessage` delivery fails, the bridge can return a temporary `fallbackCode` payload.
Current fallback code storage is in-memory in the web runtime; switch to a shared store for multi-instance production deploys.

Redeem once through:

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

## Bootstrap Flow

After bind, the extension must use only the installation token.

### Bootstrap request

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

### Bootstrap payload semantics

The extension must consume these fields as follows:

- `compatibility`
  - decides whether the current version/schema/capabilities are allowed
- `entitlements`
  - product permissions and numeric limits derived from plan plus overrides
- `featureFlags`
  - feature on/off state
- `remoteConfig`
  - operational parameters for the enabled features
- `quotaHints`
  - UI hints for remaining quota; not source of truth
- `aiAccessPolicy`
  - allowed AI routing mode and provider policy
- `deprecationMessages`
  - user-facing warnings that should be shown in extension UI
- `killSwitches`
  - hard stop conditions; if `extension.unsupported` is present, disable managed flows
- `refreshAfterSeconds`
  - next refresh deadline target
- `issuedAt`
  - when this payload was generated

### Compatibility behavior

Current compatibility statuses:

- `supported`
- `supported_with_warnings`
- `deprecated`
- `unsupported`

Current platform behavior:

- `unsupported` adds kill switch `extension.unsupported`
- any `compatibility.reason` is mirrored into `deprecationMessages`

Extension behavior expectations:

- `supported`
  - continue normally
- `supported_with_warnings`
  - continue, but show a non-blocking warning when useful
- `deprecated`
  - continue with a visible upgrade notice
- `unsupported`
  - disable managed actions, preserve safe fallback UI, and prompt upgrade/reconnect

### Refresh behavior

Current platform default:

- `EXTENSION_SESSION_TTL_MINUTES` defaults to `30`
- `refreshAfterSeconds` is half of TTL, minimum `60`
- with default settings the extension should refresh at about `900` seconds

Recommended extension strategy:

1. refresh immediately after bind success if bootstrap is missing or stale
2. schedule refresh before `refreshAfterSeconds`
3. refresh after extension update, capability change, workspace switch, or reconnect
4. if refresh fails because of network error, keep last known bootstrap temporarily
5. if refresh fails with `401`, clear installation token and trigger reconnect UX

## Usage Telemetry Flow

### Usage request

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

Important platform behavior:

- platform derives effective `installationId` from the installation session
- platform derives effective `workspaceId` from the installation binding when present
- platform enriches the payload with browser, extension version, schema version, and capabilities
- telemetry is queued asynchronously through the worker

### Minimum event taxonomy to implement

- `extension.quiz_answer_requested`
- `extension.screenshot_requested`
- `extension.multi_check_requested`
- `extension.compatibility_warning_seen`
- `extension.compatibility_blocked`
- `extension.runtime_error`
- `extension.bootstrap_refresh_failed`
- `extension.installation_reconnect_requested`
- `extension.installation_reconnected`

### Recommended payload fields

For answer-like events:

- `surface`
- `questionType`
- `answerMode`
- `provider`
- `model`
- `durationMs`
- `success`
- `errorCode`

For runtime errors:

- `surface`
- `message`
- `stackPreview`
- `severity`
- `feature`

Avoid sending raw page contents, secrets, or sensitive user tokens.

## State Storage Rules

The extension may store:

- `installationId`
- installation token
- token expiry
- workspace id returned from bind
- last known bootstrap payload
- non-sensitive UI preferences

The extension must not store as durable truth:

- plan code
- billing state
- entitlements
- compatibility verdict
- feature availability
- quota numbers as final truth
- AI provider policy
- provider secrets

The extension must not expose:

- raw site access token
- raw site refresh token
- raw BYOK provider keys

## Required Extension Modules

### `platform-auth.ts`

Responsibilities:

- load or create `installationId`
- open the bridge page
- receive bind result
- validate bridge message origin
- persist installation token and expiry
- clear auth state on terminal auth failure

Suggested methods:

- `getOrCreateInstallationId()`
- `connectToPlatform()`
- `handleBridgeMessage()`
- `clearInstallationSession()`

### `platform-bootstrap.ts`

Responsibilities:

- call `/extension/bootstrap/v2`
- cache last known bootstrap
- schedule refresh
- derive UI state from compatibility, flags, config, and kill switches

Suggested methods:

- `refreshBootstrap()`
- `loadBootstrapCache()`
- `saveBootstrapCache()`
- `scheduleBootstrapRefresh()`

### `platform-telemetry.ts`

Responsibilities:

- send usage and runtime events
- retry lightweight telemetry when appropriate
- drop or coalesce noisy duplicate events

Suggested methods:

- `sendUsageEvent()`
- `sendRuntimeError()`
- `flushBufferedEvents()`

### `platform-state.ts`

Responsibilities:

- centralized storage wrapper
- hold current installation id, workspace id, token expiry, bootstrap cache

Suggested state:

- `installationId`
- `workspaceId`
- `installationToken`
- `installationTokenExpiresAt`
- `lastBootstrap`
- `lastBootstrapFetchedAt`

### `platform-ui.ts`

Responsibilities:

- show reconnect banner/modal
- show compatibility or deprecation warning
- show unsupported-version message
- show backend-unavailable fallback state

## Error Handling Contract

### Expected failure classes

- `400 Bad Request`
  - invalid handshake
  - missing required fields
- `401 Unauthorized`
  - missing bearer token
  - invalid installation token
  - expired installation token
  - installation token does not match requested installation
  - installation was manually disconnected from the dashboard
- `503 Service Unavailable`
  - bind attempted while platform runtime mode is not connected
- network failure
  - API temporarily unavailable

### Extension behavior by error type

- `400`
  - log developer-visible error
  - stop retry loop until extension state changes
- `401` during bootstrap or usage events
  - clear installation token
  - keep last known bootstrap briefly if safe
  - prompt reconnect
- `503`
  - show service unavailable status
  - retry later
- network failure
  - preserve current safe UI
  - use cached bootstrap if present
  - retry with backoff

## Required Data The Platform Owner Must Give The Extension Developer

Before implementation starts, confirm these items:

- site URL for each environment
- API URL for each environment
- default workspace selection rule
- supported `schemaVersion`
- final `capabilities` list
- bridge return mechanism:
  - `window.postMessage`
  - or extension callback URL
- allowed browsers and browser-specific caveats
- telemetry event taxonomy
- reconnect UX wording
- unsupported-version UX wording
- fallback behavior when backend is unavailable

## Recommended Acceptance Checklist

The integration is complete only when all of the following are true:

1. User can sign in on the site.
2. Extension can generate and persist `installationId`.
3. Extension can open the site bridge and receive bind result.
4. Extension receives installation token, not raw site token.
5. Extension can call `/extension/bootstrap/v2`.
6. Extension can call `/extension/usage-events/v2`.
7. Dashboard and extension reflect the same workspace binding.
8. Unsupported compatibility produces visible extension warning and safe disable behavior.
9. Expired token triggers reconnect flow.
10. Temporary backend outage falls back to last known bootstrap instead of hard crash.

## Manual Test Script

Use this manual verification sequence:

1. Start platform stack.
2. Sign in at `http://localhost:3000/auth/login`.
3. Trigger extension connect.
4. Confirm bridge returns bind result.
5. Confirm extension stores installation token and bootstrap cache.
6. Restart browser and confirm `installationId` persists.
7. Trigger bootstrap refresh and confirm success.
8. Send one usage event and confirm platform accepts it.
9. Expire or clear the installation token and confirm reconnect prompt appears.
10. Simulate API outage and confirm extension falls back safely.

## Short Implementation Brief

If you need a compact version to paste to the extension developer:

1. Generate and persist a stable `installationId`.
2. Build the handshake with `extensionVersion`, `buildId`, `schemaVersion`, `capabilities`, and `browser`.
3. Open a site bridge page, not the API directly with raw site auth.
4. Receive a short-lived installation token from `/extension/installations/bind`.
5. Use that installation token for `/extension/bootstrap/v2` and `/extension/usage-events/v2`.
6. Cache only `installationId`, token, expiry, and last known bootstrap.
7. Respect `compatibility`, `featureFlags`, `remoteConfig`, `entitlements`, `quotaHints`, `aiAccessPolicy`, `deprecationMessages`, and `killSwitches`.
8. On `401`, clear token and prompt reconnect.
9. On network failure, fall back to last known bootstrap.

## Repo References

- `docs/site-platform-extension-connection-runbook.md`
- `apps/api/src/extension/extension-control.controller.ts`
- `apps/api/src/extension/extension-control.service.ts`
- `apps/web/src/lib/auth-session.ts`
- `packages/contracts/src/index.ts`
- `packages/extension/src/index.ts`
