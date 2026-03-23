import { type ApiRouteDefinition } from '@quizmind/contracts';

export const apiRoutes: ApiRouteDefinition[] = [
  {
    method: 'GET',
    path: '/health',
    summary: 'Return runtime status, configured infrastructure, and queue readiness.',
  },
  {
    method: 'GET',
    path: '/foundation',
    summary: 'Return monorepo foundation metadata, route inventory, and platform capabilities.',
  },
  {
    method: 'POST',
    path: '/auth/register',
    summary: 'Register a new user, create a session, and send an email verification link.',
  },
  {
    method: 'POST',
    path: '/auth/login',
    summary: 'Authenticate a user and issue access + refresh tokens.',
  },
  {
    method: 'POST',
    path: '/auth/refresh',
    summary: 'Rotate a refresh token and issue a new access + refresh token pair.',
  },
  {
    method: 'POST',
    path: '/auth/logout',
    summary: 'Revoke the current session by refresh token or bearer access token.',
  },
  {
    method: 'POST',
    path: '/auth/logout-all',
    summary: 'Revoke all active sessions for the current user.',
  },
  {
    method: 'GET',
    path: '/auth/me',
    summary: 'Return the current session principal and workspace memberships.',
  },
  {
    method: 'GET',
    path: '/auth/verify-email',
    summary: 'Verify a pending email verification token and mark the email as confirmed.',
  },
  {
    method: 'GET',
    path: '/workspaces',
    summary: 'List workspaces accessible to the current user.',
    permission: 'workspaces:read',
  },
  {
    method: 'GET',
    path: '/billing/subscription',
    summary: 'Return current subscription, plan, and entitlement state for a workspace.',
    permission: 'subscriptions:read',
  },
  {
    method: 'POST',
    path: '/extension/bootstrap',
    summary: 'Resolve compatibility, feature flags, and remote config for an extension installation.',
  },
  {
    method: 'POST',
    path: '/extension/usage-events',
    summary: 'Ingest extension usage and telemetry events.',
  },
  {
    method: 'GET',
    path: '/admin/users',
    summary: 'List users, their system roles, and workspace memberships.',
    permission: 'users:read',
  },
  {
    method: 'GET',
    path: '/admin/feature-flags',
    summary: 'List feature flags and rollout state.',
    permission: 'feature_flags:read',
  },
  {
    method: 'POST',
    path: '/admin/remote-config/publish',
    summary: 'Publish a remote config version.',
    permission: 'remote_config:publish',
  },
  {
    method: 'GET',
    path: '/support/impersonation-sessions',
    summary: 'List recent support impersonation sessions with actor, target, and workspace context.',
    permission: 'support:impersonate',
  },
  {
    method: 'GET',
    path: '/support/tickets',
    summary: 'List support tickets with queue filters, named presets, requester context, and recent workflow history.',
    permission: 'support:impersonate',
  },
  {
    method: 'POST',
    path: '/support/impersonation',
    summary: 'Start a support impersonation session and emit audit + security logs.',
    permission: 'support:impersonate',
  },
  {
    method: 'POST',
    path: '/support/tickets/update',
    summary: 'Assign a support ticket, update workflow status, and save handoff metadata.',
    permission: 'support:impersonate',
  },
  {
    method: 'POST',
    path: '/support/tickets/preset-favorite',
    summary: 'Persist or remove personal support queue preset favorites for the current operator.',
    permission: 'support:impersonate',
  },
  {
    method: 'POST',
    path: '/support/impersonation/end',
    summary: 'End an active support impersonation session, persist an optional close reason, and emit audit + security logs.',
    permission: 'support:impersonate',
  },
] as const;
