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
    path: '/auth/login',
    summary: 'Authenticate a user and issue access + refresh tokens.',
  },
  {
    method: 'GET',
    path: '/auth/me',
    summary: 'Return the current session principal and workspace memberships.',
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
    method: 'POST',
    path: '/support/impersonation',
    summary: 'Start a support impersonation session and emit audit + security logs.',
    permission: 'support:impersonate',
  },
] as const;
