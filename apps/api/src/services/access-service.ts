import { buildAccessContext, getPrincipalPermissions, type SessionPrincipal } from '@quizmind/auth';
import { evaluateAccess } from '@quizmind/permissions';
import { type AccessDecision } from '@quizmind/contracts';

export function canPublishRemoteConfig(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'remote_config:publish',
  });
}

export function canReadWorkspaceSubscription(
  principal: SessionPrincipal,
  workspaceId: string,
): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'subscriptions:read',
    workspaceId,
    requiredEntitlements: ['feature.remote_sync'],
  });
}

export function listPrincipalPermissions(
  principal: SessionPrincipal,
  workspaceId?: string,
): string[] {
  return getPrincipalPermissions(principal, workspaceId);
}
