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

export function canManagePlans(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'plans:manage',
  });
}

export function canReadUsers(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'users:read',
  });
}

export function canUpdateUsers(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'users:update',
  });
}

export function canReadAuditLogs(principal: SessionPrincipal, workspaceId?: string): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'audit_logs:read',
    ...(workspaceId ? { workspaceId } : {}),
  });
}

export function canExportAuditLogs(principal: SessionPrincipal, workspaceId?: string): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'audit_logs:export',
    ...(workspaceId ? { workspaceId } : {}),
  });
}

export function canReadJobs(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'jobs:read',
  });
}

export function canRetryJobs(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'jobs:retry',
  });
}

export function canReadWorkspace(principal: SessionPrincipal, workspaceId: string): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'workspaces:read',
    workspaceId,
  });
}

export function canReadExtensionInstallations(
  principal: SessionPrincipal,
  workspaceId: string,
): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'installations:read',
    workspaceId,
  });
}

export function canWriteExtensionInstallations(
  principal: SessionPrincipal,
  workspaceId: string,
): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'installations:write',
    workspaceId,
  });
}

export function canReadProviderCredentials(
  principal: SessionPrincipal,
  workspaceId: string,
): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'credentials:read',
    workspaceId,
  });
}

export function canWriteProviderCredentials(
  principal: SessionPrincipal,
  workspaceId: string,
): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'credentials:write',
    workspaceId,
  });
}

export function canRotateProviderCredentials(
  principal: SessionPrincipal,
  workspaceId: string,
): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'credentials:rotate',
    workspaceId,
  });
}

export function canManageAiProviders(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'ai_providers:manage',
  });
}

export function canManageCompatibilityRules(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'compatibility_rules:manage',
  });
}

export function canReadUsage(principal: SessionPrincipal, workspaceId: string): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'usage:read',
    workspaceId,
  });
}

export function canExportUsage(principal: SessionPrincipal, workspaceId: string): AccessDecision {
  const context = buildAccessContext(principal);

  return evaluateAccess(context, {
    permission: 'usage:export',
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
