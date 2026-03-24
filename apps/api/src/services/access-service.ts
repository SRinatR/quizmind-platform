import { buildAccessContext, getPrincipalPermissions, type SessionPrincipal } from '@quizmind/auth';
import { evaluateAccess } from '@quizmind/permissions';
import { type AccessDecision } from '@quizmind/contracts';

export function canPublishRemoteConfig(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'remote_config:publish',
  });
}

export function canReadFeatureFlags(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'feature_flags:read',
  });
}

export function canWriteFeatureFlags(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'feature_flags:write',
  });
}

export function canReadUsers(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'users:read',
  });
}

export function canReadWorkspace(principal: SessionPrincipal, workspaceId: string): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'workspaces:read',
    workspaceId,
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
  });
}

export function canUpdateWorkspaceSubscription(
  principal: SessionPrincipal,
  workspaceId: string,
): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'subscriptions:update',
    workspaceId,
  });
}

export function canStartSupportImpersonation(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'support:impersonate',
  });
}

export function canReadSupportImpersonationSessions(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'support:impersonate',
  });
}

export function canReadSupportTickets(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'support:impersonate',
  });
}

export function canEndSupportImpersonation(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'support:impersonate',
  });
}

export function listPrincipalPermissions(
  principal: SessionPrincipal,
  workspaceId?: string,
): string[] {
  return getPrincipalPermissions(principal, workspaceId);
}
