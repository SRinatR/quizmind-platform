import { buildAccessContext, getPrincipalPermissions, type SessionPrincipal } from '@quizmind/auth';
import { evaluateAccess } from '@quizmind/permissions';
import { type AccessDecision } from '@quizmind/contracts';

export function canPublishRemoteConfig(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'remote_config:publish' });
}

export function canReadFeatureFlags(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'feature_flags:read' });
}

export function canWriteFeatureFlags(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'feature_flags:write' });
}

export function canReadUsers(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'users:read' });
}

export function canUpdateUsers(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'users:update' });
}

export function canReadAuditLogs(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'audit_logs:read' });
}

export function canExportAuditLogs(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'audit_logs:export' });
}

export function canReadJobs(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'jobs:read' });
}

export function canRetryJobs(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'jobs:retry' });
}

export function canReadExtensionInstallations(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'installations:read' });
}

export function canWriteExtensionInstallations(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'installations:write' });
}

export function canReadProviderCredentials(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'credentials:read' });
}

export function canWriteProviderCredentials(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'credentials:write' });
}

export function canRotateProviderCredentials(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'credentials:rotate' });
}

export function canManageAiProviders(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'ai_providers:manage' });
}

export function canManageCompatibilityRules(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'compatibility_rules:manage' });
}

export function canReadUsage(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'usage:read' });
}

export function canExportUsage(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'usage:export' });
}

export function canReadBilling(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'subscriptions:read' });
}

export function canUpdateBilling(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'subscriptions:update' });
}

export function canStartSupportImpersonation(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'support:impersonate' });
}

export function canReadSupportImpersonationSessions(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'support:impersonate' });
}

export function canReadSupportTickets(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'support:impersonate' });
}

export function canEndSupportImpersonation(principal: SessionPrincipal): AccessDecision {
  const context = buildAccessContext(principal);
  return evaluateAccess(context, { permission: 'support:impersonate' });
}

export function listPrincipalPermissions(principal: SessionPrincipal): string[] {
  return getPrincipalPermissions(principal);
}
