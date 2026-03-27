import { type AccessContext, type AccessRequirement } from '@quizmind/contracts';
import { evaluateAccess } from '@quizmind/permissions';

import { adminSections } from '../admin/sections';
import { dashboardSections } from '../dashboard/sections';

export type NavigationScope = 'dashboard' | 'admin';

export interface NavigationAccessMatrixRow {
  id: string;
  title: string;
  href: string;
  scope: NavigationScope;
  allowed: boolean;
  requirementSummary: string;
  reason?: string;
}

function resolveAccessDecision(input: {
  context: AccessContext;
  workspaceId?: string;
  requirement?: AccessRequirement;
}) {
  if (!input.requirement) {
    return {
      allowed: true,
      reasons: [] as string[],
    };
  }

  return evaluateAccess(input.context, {
    ...input.requirement,
    workspaceId: input.requirement.workspaceId ?? input.workspaceId,
  });
}

export function describeAccessRequirement(requirement?: AccessRequirement): string {
  if (!requirement) {
    return 'No explicit access requirement';
  }

  const parts = [`permission ${requirement.permission}`];

  if (requirement.requireSystemRole) {
    parts.push(`system role ${requirement.requireSystemRole}`);
  }

  if (requirement.requireWorkspaceRole) {
    parts.push(`workspace role ${requirement.requireWorkspaceRole}`);
  }

  if (requirement.requiredEntitlements && requirement.requiredEntitlements.length > 0) {
    parts.push(`entitlements ${requirement.requiredEntitlements.join(', ')}`);
  }

  if (requirement.requiredFlags && requirement.requiredFlags.length > 0) {
    parts.push(`feature flags ${requirement.requiredFlags.join(', ')}`);
  }

  if (requirement.requireOwnership) {
    parts.push('workspace ownership');
  }

  return parts.join(' | ');
}

function createRowsForScope(input: {
  scope: NavigationScope;
  context: AccessContext;
  workspaceId?: string;
}): NavigationAccessMatrixRow[] {
  const sections = input.scope === 'admin' ? adminSections : dashboardSections;

  return sections.map((section) => {
    const decision = resolveAccessDecision({
      context: input.context,
      workspaceId: input.workspaceId,
      requirement: section.requirement,
    });

    return {
      id: section.id,
      title: section.title,
      href: section.href,
      scope: input.scope,
      allowed: decision.allowed,
      requirementSummary: describeAccessRequirement(section.requirement),
      reason: decision.reasons[0],
    };
  });
}

export function buildAccessMatrixRows(input: {
  context: AccessContext;
  workspaceId?: string;
  scopes?: NavigationScope[];
}): NavigationAccessMatrixRow[] {
  const scopes = input.scopes ?? ['dashboard', 'admin'];
  const rows: NavigationAccessMatrixRow[] = [];

  if (scopes.includes('dashboard')) {
    rows.push(
      ...createRowsForScope({
        scope: 'dashboard',
        context: input.context,
        workspaceId: input.workspaceId,
      }),
    );
  }

  if (scopes.includes('admin')) {
    rows.push(
      ...createRowsForScope({
        scope: 'admin',
        context: input.context,
        workspaceId: input.workspaceId,
      }),
    );
  }

  return rows;
}
